import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { calculatePredictionScore, calculateKnockoutScore } from '../src/lib/scoring.js';
import fs from 'fs';
import path from 'path';

const KNOCKOUT_STAGES = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];

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

    // 3. Format and Sync matches to Firestore — only write docs that changed
    console.log("Starting matches sync to Firestore...");
    const matchesCollection = db.collection('matches');

    // Pre-fetch all existing match docs (used both for change detection and scoring below)
    const existingMatchesSnap = await matchesCollection.get();
    const existingMatchesMap = {};
    existingMatchesSnap.forEach(doc => { existingMatchesMap[doc.id] = doc.data(); });

    let syncCount = 0;
    let batch = db.batch();

    for (const match of apiMatches) {
        const formatted = formatMatchForDb(match);
        const existing = existingMatchesMap[formatted.id];

        if (hasMatchChanged(existing, formatted)) {
            const docRef = matchesCollection.doc(formatted.id);
            // If the score changed on an already-scored match, clear the flag so it gets re-scored
            const scoreChanged = existing && existing.predictionsScored && (
                existing.actualResult !== formatted.actualResult ||
                existing.actualTotalGoals !== formatted.actualTotalGoals ||
                existing.actualAdvancing !== formatted.actualAdvancing ||
                existing.actualDepartureMethod !== formatted.actualDepartureMethod
            );
            batch.set(docRef, scoreChanged
                ? { ...formatted, predictionsScored: false }
                : formatted,
                { merge: true });
            syncCount++;
            if (syncCount % 400 === 0) { await batch.commit(); batch = db.batch(); }
        }
    }

    if (syncCount > 0 && syncCount % 400 !== 0) await batch.commit();
    console.log(`Synced ${syncCount}/${apiMatches.length} changed matches to DB (${apiMatches.length - syncCount} unchanged, skipped).`);

    // 4. Recalculate Scores
    console.log("Recalculating predictions and user standings...");

    // Build finished-matches map from already-fetched data (saves an extra Firestore read)
    const finishedMatches = {};
    let hasUnscored = false;
    const finishedScoredMatchIds = []; // finished matches already marked predictionsScored:true
    existingMatchesSnap.forEach(docSnap => {
        const data = docSnap.data();
        const matchedApi = apiMatches.find(m => String(m.id) === docSnap.id);
        const status = matchedApi ? matchedApi.status : data.status;
        if (status === 'FINISHED') {
            // Always use fresh result/goals from API — the Firestore snapshot was taken
            // before the sync batch committed, so data.actualResult may still be null
            // for matches that just transitioned from LIVE → FINISHED this run.
            const actualResult = matchedApi ? calculateResult(matchedApi.score) : data.actualResult;
            const actualTotalGoals = matchedApi ? calculateGoals(matchedApi.score) : data.actualTotalGoals;
            const isKnockout = KNOCKOUT_STAGES.includes(data.stage);
            const actualAdvancing = isKnockout ? (matchedApi ? calculateAdvancing(matchedApi.score) : data.actualAdvancing) : null;
            const actualDepartureMethod = isKnockout ? (matchedApi ? calculateDepartureMethod(matchedApi.score) : data.actualDepartureMethod) : null;
            finishedMatches[docSnap.id] = { ...data, status, actualResult, actualTotalGoals, actualAdvancing, actualDepartureMethod };
            if (!data.predictionsScored) {
                hasUnscored = true;
            } else {
                finishedScoredMatchIds.push(docSnap.id);
            }
        }
    });

    const forceRecalculate = process.env.FORCE_RECALCULATE === 'true';

    // Self-healing: if all matches are marked scored but some predictions may be stuck
    // (resultCorrect: null), detect this with a cheap targeted query before giving up.
    // Only runs when there are no obviously unscored matches — avoids extra reads on
    // normal no-op runs.
    if (!hasUnscored && !forceRecalculate && finishedScoredMatchIds.length > 0) {
        // Check for stuck predictions client-side — avoids a composite Firestore index.
        // Checks both regular (resultCorrect: null) and knockout (advancingCorrect: null).
        const checkIds = finishedScoredMatchIds.slice(0, 30);
        const stuckSnap = await db.collection('predictions')
            .where('matchId', 'in', checkIds)
            .get();
        const hasStuck = stuckSnap.docs.some(d => {
            const p = d.data();
            const m = finishedMatches[p.matchId];
            if (!m) return false;
            if (KNOCKOUT_STAGES.includes(m.stage)) {
                return p.predictedAdvancing && p.advancingCorrect === null;
            }
            return p.resultCorrect === null;
        });
        if (hasStuck) {
            console.log('Detected stuck predictions on scored matches. Triggering recalculation...');
            hasUnscored = true;
        }
    }

    if (!hasUnscored && !forceRecalculate) {
        console.log('All finished matches already scored — skipping prediction recalculation.');
        await db.collection('system').doc('status').set({
            lastSync: new Date(),
            status: 'success',
            matchesSyncedCount: apiMatches.length,
            error: null
        }, { merge: true });
        console.log("Synchronization completed successfully (no new results to score).");
        process.exit(0);
    }

    if (forceRecalculate) {
        console.log('FORCE_RECALCULATE=true — running full recalculation regardless of scored flags.');
    } else {
        console.log('Found unscored finished matches. Running full recalculation...');
    }

    // Retrieve all predictions
    const predictionsSnapshot = await db.collection('predictions').get();

    const userScores = {};
    batch = db.batch();
    let updateCount = 0;

    predictionsSnapshot.forEach(docSnap => {
        const prediction = docSnap.data();
        const match = finishedMatches[prediction.matchId];
        if (!match) return;

        const uid = prediction.userId;
        if (!userScores[uid]) {
            userScores[uid] = { totalPoints: 0, correctPredictions: 0, correctGoals: 0, jokerPoints: 0, jokerCorrect: null, doubleCorrect: 0, doubleTotal: 0 };
        }

        const isKnockout = KNOCKOUT_STAGES.includes(match.stage);

        if (isKnockout) {
            // Skip incomplete knockout predictions (missing any of the three required fields)
            if (!prediction.predictedAdvancing || !prediction.predictedGoalsTier || !prediction.predictedDepartureMethod) return;
            if (match.actualAdvancing === null) return;

            const { points, advancingCorrect, goalsCorrect, departureCorrect } = calculateKnockoutScore(
                prediction,
                match.actualAdvancing,
                match.actualTotalGoals,
                match.actualDepartureMethod
            );

            batch.update(docSnap.ref, { pointsAwarded: points, advancingCorrect, goalsCorrect, departureCorrect });
            updateCount++;
            if (updateCount % 400 === 0) { batch.commit(); batch = db.batch(); }

            userScores[uid].totalPoints += points;
            if (advancingCorrect) userScores[uid].correctPredictions += 1;
            if (goalsCorrect) userScores[uid].correctGoals += 1;
        } else {
            if (match.actualResult === null) return;

            const { points, resultCorrect, goalsCorrect } = calculatePredictionScore(
                prediction,
                match.actualResult,
                match.actualTotalGoals,
                match.doublePoints === true
            );

            batch.update(docSnap.ref, { pointsAwarded: points, resultCorrect, goalsCorrect });
            updateCount++;
            if (updateCount % 400 === 0) { batch.commit(); batch = db.batch(); }

            userScores[uid].totalPoints += points;
            if (resultCorrect) userScores[uid].correctPredictions += 1;
            if (goalsCorrect) userScores[uid].correctGoals += 1;
            if (prediction.isJoker) {
                userScores[uid].jokerPoints = points;
                userScores[uid].jokerCorrect = resultCorrect;
            }
            if (match.doublePoints) {
                userScores[uid].doubleTotal += 2;
                if (resultCorrect) userScores[uid].doubleCorrect += 1;
                if (goalsCorrect) userScores[uid].doubleCorrect += 1;
            }
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
            jokerPoints: stats.jokerPoints,
            jokerCorrect: stats.jokerCorrect,
            doubleCorrect: stats.doubleCorrect,
            doubleTotal: stats.doubleTotal,
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

    // Mark all finished matches as scored so future runs skip recalculation
    batch = db.batch();
    for (const matchId of Object.keys(finishedMatches)) {
        batch.update(matchesCollection.doc(matchId), { predictionsScored: true });
    }
    await batch.commit();
    console.log(`Marked ${Object.keys(finishedMatches).length} finished matches as scored.`);

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

// Returns true if the API-formatted match differs from the stored doc in any meaningful way
function hasMatchChanged(existing, formatted) {
    if (!existing) return true;
    return (
        existing.status !== formatted.status ||
        existing.actualResult !== formatted.actualResult ||
        existing.actualTotalGoals !== formatted.actualTotalGoals ||
        existing.actualAdvancing !== formatted.actualAdvancing ||
        existing.actualDepartureMethod !== formatted.actualDepartureMethod ||
        existing.score?.team1 !== formatted.score?.team1 ||
        existing.score?.team2 !== formatted.score?.team2 ||
        existing.team1?.name !== formatted.team1?.name ||
        existing.team2?.name !== formatted.team2?.name ||
        existing.team1?.crest !== formatted.team1?.crest ||
        existing.team2?.crest !== formatted.team2?.crest
    );
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
    const isKnockout = KNOCKOUT_STAGES.includes(apiMatch.stage);
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
        actualAdvancing: isKnockout ? calculateAdvancing(apiMatch.score) : null,
        actualDepartureMethod: isKnockout ? calculateDepartureMethod(apiMatch.score) : null,
        score: {
            team1: apiMatch.score?.fullTime?.home ?? null,
            team2: apiMatch.score?.fullTime?.away ?? null
        }
    };
}

function calculateAdvancing(score) {
    if (!score || !score.winner || score.winner === 'DRAW') return null;
    return score.winner === 'HOME_TEAM' ? 'team1' : 'team2';
}

function calculateDepartureMethod(score) {
    if (!score || !score.duration) return null;
    if (score.duration === 'REGULAR') return 'REGULAR';
    if (score.duration === 'EXTRA_TIME') return 'EXTRA_TIME';
    if (score.duration === 'PENALTY_SHOOTOUT') return 'PENALTY_SHOOTOUT';
    return null;
}
