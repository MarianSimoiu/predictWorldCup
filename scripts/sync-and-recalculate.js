import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { calculatePredictionScore } from '../src/lib/scoring.js';
import fs from 'fs';
import path from 'path';

// 1. Initialize Firebase Admin SDK
let serviceAccount;

if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.log("Loading service account credentials from FIREBASE_SERVICE_ACCOUNT environment variable.");
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    // Try to load local credentials for local testing
    const localCredPath = path.resolve('./predict2026-f98e8-firebase-adminsdk-fbsvc-f4da4c6b65.json');
    if (fs.existsSync(localCredPath)) {
        console.log(`Loading credentials locally from ${localCredPath}`);
        serviceAccount = JSON.parse(fs.readFileSync(localCredPath, 'utf8'));
    } else {
        console.error("Error: Firebase Admin SDK credentials not found.");
        console.error("For CI: Set the FIREBASE_SERVICE_ACCOUNT environment variable.");
        console.error("For Local: Ensure predict2026-f98e8-firebase-adminsdk-fbsvc-f4da4c6b65.json is in the project root.");
        process.exit(1);
    }
}

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

// 2. Fetch matches from football-data.org API
const apiKey = process.env.FOOTBALL_DATA_API_KEY;
if (!apiKey) {
    console.error("Error: FOOTBALL_DATA_API_KEY environment variable is not set.");
    process.exit(1);
}

const BASE_URL = 'https://api.football-data.org/v4';
const targetUrl = `${BASE_URL}/competitions/WC/matches?season=2026`;

console.log("Fetching latest tournament match data from football-data.org...");
try {
    const response = await fetch(targetUrl, {
        headers: { 'X-Auth-Token': apiKey }
    });

    if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const apiMatches = data.matches;
    console.log(`Successfully fetched ${apiMatches.length} matches from the API.`);

    // 3. Format and Sync matches to Firestore
    console.log("Starting matches sync to Firestore...");
    const matchesCollection = db.collection('matches');
    let syncCount = 0;
    let batch = db.batch();

    for (const match of apiMatches) {
        const docRef = matchesCollection.doc(String(match.id));
        const formatted = formatMatchForDb(match);
        batch.set(docRef, formatted, { merge: true });
        syncCount++;
        
        if (syncCount % 400 === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    
    if (syncCount % 400 !== 0) {
        await batch.commit();
    }
    console.log(`Synced ${syncCount} matches to DB.`);

    // 4. Recalculate Scores
    console.log("Recalculating predictions and user standings...");

    // Create a map of finished matches for quick scoring lookups
    const finishedMatches = {};
    const matchesSnapshot = await matchesCollection.where('status', '==', 'FINISHED').get();
    matchesSnapshot.forEach(docSnap => {
        finishedMatches[docSnap.id] = docSnap.data();
    });

    // Retrieve all predictions
    const predictionsSnapshot = await db.collection('predictions').get();
    const userScores = {};

    batch = db.batch();
    let updateCount = 0;

    predictionsSnapshot.forEach(docSnap => {
        const prediction = docSnap.data();
        const match = finishedMatches[prediction.matchId];
        
        if (match && match.actualResult !== null) {
            const { points, resultCorrect, goalsCorrect } = calculatePredictionScore(
                prediction,
                match.actualResult,
                match.actualTotalGoals,
                match.doublePoints === true
            );
            
            // Queue prediction update
            batch.update(docSnap.ref, {
                pointsAwarded: points,
                resultCorrect,
                goalsCorrect
            });
            updateCount++;
            
            if (updateCount % 400 === 0) {
                // Admin SDK batches also support up to 500 writes
                batch.commit();
                batch = db.batch();
            }
            
            // Accumulate user points
            const uid = prediction.userId;
            if (!userScores[uid]) {
                userScores[uid] = { totalPoints: 0, correctPredictions: 0, correctGoals: 0 };
            }
            userScores[uid].totalPoints += points;
            if (resultCorrect) userScores[uid].correctPredictions += 1;
            if (goalsCorrect) userScores[uid].correctGoals += 1;
        }
    });

    if (updateCount % 400 !== 0) {
        await batch.commit();
    }
    console.log(`Scored and updated ${updateCount} predictions.`);

    // Update users' aggregated points and statistics
    batch = db.batch();
    let userCount = 0;
    
    for (const [userId, stats] of Object.entries(userScores)) {
        const userRef = db.collection('users').doc(userId);
        batch.set(userRef, {
            totalPoints: stats.totalPoints,
            correctPredictions: stats.correctPredictions,
            correctGoals: stats.correctGoals,
            lastUpdated: new Date()
        }, { merge: true });
        
        userCount++;
        if (userCount % 400 === 0) {
            await batch.commit();
            batch = db.batch();
        }
    }
    
    if (userCount % 400 !== 0) {
        await batch.commit();
    }
    console.log(`Updated standings for ${userCount} users.`);

    // 5. Update system status metadata doc
    await db.collection('system').doc('status').set({
        lastSync: new Date(),
        status: 'success',
        matchesSyncedCount: apiMatches.length,
        error: null
    }, { merge: true });

    console.log("Synchronization and score recalculations completed successfully!");
    process.exit(0);

} catch (error) {
    console.error("Execution failed:", error);
    
    // Log failure to Firestore so client app is aware
    try {
        await db.collection('system').doc('status').set({
            lastSync: new Date(),
            status: 'failed',
            error: error.message || String(error)
        }, { merge: true });
    } catch (dbErr) {
        console.error("Could not write failure state to Firestore system/status:", dbErr);
    }
    
    process.exit(1);
}

// Helpers mirroring db.js conversion routines
function calculateResult(score) {
    if (!score || (score.duration === 'REGULAR' && score.fullTime?.home === null)) return null;
    const home = score.regularTime?.home ?? score.fullTime?.home;
    const away = score.regularTime?.away ?? score.fullTime?.away;
    if (home === null || away === null) return null;
    if (home > away) return 'team1';
    if (away > home) return 'team2';
    return 'draw';
}

function calculateGoals(score) {
    const home = score.regularTime?.home ?? score.fullTime?.home;
    const away = score.regularTime?.away ?? score.fullTime?.away;
    if (home === null || away === null) return null;
    return home + away;
}

function formatMatchForDb(apiMatch) {
    return {
        id: String(apiMatch.id),
        matchday: apiMatch.matchday,
        group: apiMatch.group || null,
        stage: apiMatch.stage,
        team1: {
            name: apiMatch.homeTeam?.name || 'TBD',
            crest: apiMatch.homeTeam?.crest || null,
            code: apiMatch.homeTeam?.tla || null
        },
        team2: {
            name: apiMatch.awayTeam?.name || 'TBD',
            crest: apiMatch.awayTeam?.crest || null,
            code: apiMatch.awayTeam?.tla || null
        },
        kickoff: new Date(apiMatch.utcDate),
        status: apiMatch.status, // SCHEDULED, LIVE, FINISHED
        actualResult: calculateResult(apiMatch.score),
        actualTotalGoals: calculateGoals(apiMatch.score),
        score: {
            team1: apiMatch.score?.fullTime?.home ?? null,
            team2: apiMatch.score?.fullTime?.away ?? null
        }
    };
}
