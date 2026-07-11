/**
 * Admin script: manually award points to a user for a knockout prediction they couldn't submit.
 *
 * Env vars (all required unless defaults apply):
 *   DISPLAY_NAME          – user's displayName in Firestore (default: alpaca007)
 *   TEAM1_CONTAINS        – substring of team1 name to find the match (default: Spain)
 *   TEAM2_CONTAINS        – substring of team2 name to find the match (default: Belgium)
 *   PREDICTED_ADVANCING   – 'team1' or 'team2' (default: team1)
 *   PREDICTED_GOALS_TIER  – '0-1', '2-3', or '4+' (default: 2-3)
 *   PREDICTED_DEPARTURE   – REGULAR, EXTRA_TIME, or PENALTY_SHOOTOUT (default: REGULAR)
 *   POINTS                – points to award (default: 8 — auto-computed if omitted)
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fs from 'fs';
import path from 'path';

let serviceAccount;
if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
} else {
    const localCredPath = path.resolve('./predict2026-f98e8-firebase-adminsdk-fbsvc-f4da4c6b65.json');
    if (fs.existsSync(localCredPath)) {
        serviceAccount = JSON.parse(fs.readFileSync(localCredPath, 'utf8'));
    } else {
        console.error('No credentials found. Set FIREBASE_SERVICE_ACCOUNT env var.');
        process.exit(1);
    }
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

const DISPLAY_NAME        = process.env.DISPLAY_NAME        || 'alpaca007';
const TEAM1_CONTAINS      = process.env.TEAM1_CONTAINS      || 'Spain';
const TEAM2_CONTAINS      = process.env.TEAM2_CONTAINS      || 'Belgium';
const PREDICTED_ADVANCING = process.env.PREDICTED_ADVANCING || 'team1';
const PREDICTED_GOALS     = process.env.PREDICTED_GOALS_TIER || '2-3';
const PREDICTED_DEPARTURE = process.env.PREDICTED_DEPARTURE || 'REGULAR';

console.log(`Looking for match: *${TEAM1_CONTAINS}* vs *${TEAM2_CONTAINS}*`);
console.log(`User: ${DISPLAY_NAME}`);

// Find the match
const matchesSnap = await db.collection('matches').get();
let targetMatch = null;
for (const docSnap of matchesSnap.docs) {
    const d = docSnap.data();
    const t1 = d.team1?.name || '';
    const t2 = d.team2?.name || '';
    if ((t1.includes(TEAM1_CONTAINS) && t2.includes(TEAM2_CONTAINS)) ||
        (t1.includes(TEAM2_CONTAINS) && t2.includes(TEAM1_CONTAINS))) {
        targetMatch = { id: docSnap.id, ...d };
        break;
    }
}

if (!targetMatch) {
    console.error(`Match not found for ${TEAM1_CONTAINS} vs ${TEAM2_CONTAINS}`);
    process.exit(1);
}

console.log(`Match: ${targetMatch.id} — ${targetMatch.team1.name} vs ${targetMatch.team2.name} [${targetMatch.stage}]`);
console.log(`  actualAdvancing: ${targetMatch.actualAdvancing}`);
console.log(`  actualTotalGoals: ${targetMatch.actualTotalGoals}`);
console.log(`  actualDepartureMethod: ${targetMatch.actualDepartureMethod}`);

// If team names are swapped (user specified team2 name as TEAM1_CONTAINS), flip advancing
const team1HasTeam1Str = targetMatch.team1.name.includes(TEAM1_CONTAINS);
const predictedAdvancing = team1HasTeam1Str ? PREDICTED_ADVANCING : (PREDICTED_ADVANCING === 'team1' ? 'team2' : 'team1');

// Compute correct/incorrect flags
const advancingCorrect = predictedAdvancing === targetMatch.actualAdvancing;
const goalsCorrect = (() => {
    const actual = targetMatch.actualTotalGoals;
    if (actual === null) return null;
    if (PREDICTED_GOALS === '0-1') return actual <= 1;
    if (PREDICTED_GOALS === '2-3') return actual >= 2 && actual <= 3;
    if (PREDICTED_GOALS === '4+')  return actual >= 4;
    return false;
})();
const departureCorrect = PREDICTED_DEPARTURE === targetMatch.actualDepartureMethod;

const correctCount = [advancingCorrect, goalsCorrect, departureCorrect].filter(Boolean).length;
const computedPoints = correctCount > 0 ? Math.pow(2, correctCount) : 0;
const POINTS = parseInt(process.env.POINTS || String(computedPoints));

console.log(`\nPrediction to apply:`);
console.log(`  predictedAdvancing:       ${predictedAdvancing} (${advancingCorrect ? '✅' : '❌'})`);
console.log(`  predictedGoalsTier:       ${PREDICTED_GOALS}    (${goalsCorrect ? '✅' : '❌'})`);
console.log(`  predictedDepartureMethod: ${PREDICTED_DEPARTURE}  (${departureCorrect ? '✅' : '❌'})`);
console.log(`  pointsAwarded:            ${POINTS}`);

// Find prediction by display name
const predsSnap = await db.collection('predictions').where('matchId', '==', targetMatch.id).get();
const predDoc = predsSnap.docs.find(d => d.data().displayName === DISPLAY_NAME);

if (!predDoc) {
    console.error(`\nNo prediction found for "${DISPLAY_NAME}" on match ${targetMatch.id}`);
    console.log('Existing predictions:', predsSnap.docs.map(d => d.data().displayName).join(', '));
    const userId = predsSnap.docs[0]?.data()?.userId;
    console.error('Cannot create without userId. Ask the user for their account email.');
    process.exit(1);
}

const predData = predDoc.data();
const oldPoints = predData.pointsAwarded || 0;
const delta = POINTS - oldPoints;

console.log(`\nCurrent prediction state:`);
console.log(`  pointsAwarded: ${oldPoints}`);
console.log(`  predictedAdvancing: ${predData.predictedAdvancing || '(null)'}`);
console.log(`  predictedGoalsTier: ${predData.predictedGoalsTier || '(null)'}`);
console.log(`  predictedDepartureMethod: ${predData.predictedDepartureMethod || '(null)'}`);

const userId = predData.userId;
const userRef = db.collection('users').doc(userId);

await db.runTransaction(async (tx) => {
    // All reads must come before any writes in a Firestore transaction
    const userSnap = await tx.get(userRef);

    tx.update(predDoc.ref, {
        predictedAdvancing,
        predictedGoalsTier: PREDICTED_GOALS,
        predictedDepartureMethod: PREDICTED_DEPARTURE,
        pointsAwarded: POINTS,
        advancingCorrect,
        goalsCorrect,
        departureCorrect,
    });

    // firebase-admin v12: .exists is a property, not a method
    if (userSnap.exists) {
        const u = userSnap.data();
        const newTotal = (u.totalPoints || 0) + delta;
        const newCorrectPreds = (u.correctPredictions || 0) + (advancingCorrect ? 1 : 0);
        const newCorrectGoals = (u.correctGoals || 0) + (goalsCorrect ? 1 : 0);
        tx.update(userRef, {
            totalPoints: newTotal,
            correctPredictions: newCorrectPreds,
            correctGoals: newCorrectGoals,
            lastUpdated: new Date(),
        });
        console.log(`\nUser totals: ${u.totalPoints || 0} → ${newTotal} pts`);
    } else {
        console.warn('User document not found — only prediction was updated.');
    }
});

console.log(`\n✅ Done! "${DISPLAY_NAME}" now has ${POINTS} pts for ${targetMatch.team1.name} vs ${targetMatch.team2.name} (delta: ${delta >= 0 ? '+' : ''}${delta})`);
process.exit(0);
