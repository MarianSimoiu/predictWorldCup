import { collection, doc, writeBatch, getDocs, getDoc, setDoc, query, orderBy, onSnapshot, where } from 'firebase/firestore';
import { db } from './firebase.js';
import { matchStore, predictionStore } from './stores.svelte.js';
import { calculatePredictionScore } from './scoring.js';

// Convert API match to our Firestore structure
export function formatMatchForDb(apiMatch) {
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

function calculateResult(score) {
    if (!score || score.duration === 'REGULAR' && score.fullTime?.home === null) return null;
    
    // Use regular time score for 90-min result (for knockouts)
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

// Sync matches to Firestore
export async function syncMatchesToDb(apiMatches) {
    const batch = writeBatch(db);
    const matchesRef = collection(db, 'matches');
    
    let count = 0;
    for (const match of apiMatches) {
        const docRef = doc(matchesRef, String(match.id));
        const formatted = formatMatchForDb(match);
        batch.set(docRef, formatted, { merge: true });
        count++;
        
        // Firestore batches support up to 500 writes
        if (count % 400 === 0) {
            await batch.commit();
        }
    }
    
    if (count % 400 !== 0) {
        await batch.commit();
    }
    console.log(`Synced ${count} matches to DB.`);
}

// Listen to matches real-time
export function listenToMatches() {
    const q = query(collection(db, 'matches'), orderBy('kickoff', 'asc'));
    return onSnapshot(q, (snapshot) => {
        const matches = [];
        snapshot.forEach((doc) => {
            matches.push({ id: doc.id, ...doc.data(), kickoff: doc.data().kickoff.toDate() });
        });
        matchStore.matches = matches;
        matchStore.loading = false;
        matchStore.error = null;
    }, (error) => {
        console.error("Error listening to matches:", error);
        matchStore.loading = false;
        matchStore.error = error.message || String(error);
    });
}

// Listen to user predictions real-time
export function listenToUserPredictions(userId) {
    if (!userId) return () => {};
    predictionStore.loading = true;
    const q = query(collection(db, 'predictions'), where('userId', '==', userId));
    return onSnapshot(q, (snapshot) => {
        const preds = {};
        snapshot.forEach((doc) => {
            const data = doc.data();
            preds[data.matchId] = { id: doc.id, ...data };
        });
        predictionStore.predictions = preds;
        predictionStore.loading = false;
        predictionStore.error = null;
    }, (error) => {
        console.error("Error listening to predictions:", error);
        predictionStore.loading = false;
        predictionStore.error = error.message || String(error);
    });
}

// Prediction logic
function isPlaceholderTeam(teamName) {
    if (!teamName) return true;
    const name = teamName.toLowerCase();
    return name.includes('winner') ||
           name.includes('runner-up') ||
           name.includes('finalist') ||
           name.includes('tbd');
}

export { isPlaceholderTeam };

export async function savePrediction(userId, matchId, predictedResult, predictedGoalsTier) {
    const predictionId = `${userId}_${matchId}`;
    const docRef = doc(db, 'predictions', predictionId);
    
    // Check if match is locked (1 hour before kickoff)
    const match = matchStore.matches.find(m => String(m.id) === String(matchId));
    if (!match) throw new Error("Match not found");

    // Block predictions if teams are not yet determined
    if (isPlaceholderTeam(match.team1?.name) || isPlaceholderTeam(match.team2?.name)) {
        throw new Error("Teams are not yet finalized. Predictions are locked until both qualifying teams are known.");
    }
    
    const lockTime = new Date(match.kickoff.getTime() - 60 * 60 * 1000); // 1 hour before
    if (new Date() >= lockTime) {
        throw new Error("Match is locked. Predictions are closed.");
    }
    
    await setDoc(docRef, {
        userId,
        matchId: String(matchId),
        predictedResult,
        predictedGoalsTier: predictedGoalsTier || null,
        submittedAt: new Date(),
        pointsAwarded: 0,
        resultCorrect: null,
        goalsCorrect: null
    }, { merge: true });
}


export async function getPrediction(userId, matchId) {
    const predictionId = `${userId}_${matchId}`;
    const docRef = doc(db, 'predictions', predictionId);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
        return { id: snap.id, ...snap.data() };
    }
    return null;
}

export async function recalculateAllScores() {
    // 1. Fetch finished matches
    const qMatches = query(collection(db, 'matches'), where('status', '==', 'FINISHED'));
    const matchSnap = await getDocs(qMatches);
    const matchesMap = {};
    matchSnap.forEach(doc => {
        matchesMap[doc.id] = doc.data();
    });

    // 2. Fetch all predictions
    const qPreds = query(collection(db, 'predictions'));
    const predsSnap = await getDocs(qPreds);
    
    const userScores = {};
    
    // Batch writes
    let batch = writeBatch(db);
    let count = 0;
    
    async function commitBatch() {
        if (count > 0) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
        }
    }

    predsSnap.forEach(docSnap => {
        const p = docSnap.data();
        const match = matchesMap[p.matchId];
        
        if (match && match.actualResult !== null) {
            const { points, resultCorrect, goalsCorrect } = calculatePredictionScore(p, match.actualResult, match.actualTotalGoals);
            
            // Update prediction doc
            batch.update(docSnap.ref, { pointsAwarded: points, resultCorrect, goalsCorrect });
            count++;
            if (count === 400) commitBatch();
            
            // Tally user score
            if (!userScores[p.userId]) {
                userScores[p.userId] = { totalPoints: 0, correctPredictions: 0 };
            }
            userScores[p.userId].totalPoints += points;
            if (resultCorrect) userScores[p.userId].correctPredictions += 1;
        }
    });
    
    await commitBatch();
    
    // 3. Update user docs
    for (const [userId, stats] of Object.entries(userScores)) {
        batch.set(doc(db, 'users', userId), {
            totalPoints: stats.totalPoints,
            correctPredictions: stats.correctPredictions,
            lastUpdated: new Date()
        }, { merge: true });
        count++;
        if (count === 400) await commitBatch();
    }
    await commitBatch();
}

export async function saveWinnerPrediction(userId, teamName) {
    const docRef = doc(db, 'users', userId);
    await setDoc(docRef, { winnerPrediction: teamName }, { merge: true });
}

export async function ensureUserProfile(user) {
    if (!user) return;
    const docRef = doc(db, 'users', user.uid);
    await setDoc(docRef, {
        displayName: user.displayName || null,
        email: user.email || null,
        lastActive: new Date()
    }, { merge: true });
}

