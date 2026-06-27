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
        console.error("Error: Firebase credentials not found.");
        process.exit(1);
    }
}

initializeApp({
    credential: cert(serviceAccount)
});

const db = getFirestore();

async function diagnose() {
    try {
        // Find Spain vs Uruguay match
        console.log("Finding Spain vs Uruguay match...");
        const matchesSnap = await db.collection('matches')
            .where('stage', '==', 'GROUP_STAGE')
            .where('status', '==', 'FINISHED')
            .get();

        let spainMatch = null;
        matchesSnap.forEach(doc => {
            const data = doc.data();
            if ((data.team1.name.includes('Spain') && data.team2.name.includes('Uruguay')) ||
                (data.team1.name.includes('Uruguay') && data.team2.name.includes('Spain'))) {
                spainMatch = { id: doc.id, ...data };
            }
        });

        if (!spainMatch) {
            console.log("Spain vs Uruguay match not found");
            process.exit(0);
        }

        console.log("\n=== MATCH DATA ===");
        console.log(`Match ID: ${spainMatch.id}`);
        console.log(`Team 1: ${spainMatch.team1.name} vs Team 2: ${spainMatch.team2.name}`);
        console.log(`Actual Result: ${spainMatch.actualResult}`);
        console.log(`Actual Total Goals: ${spainMatch.actualTotalGoals}`);
        console.log(`Score - Team1: ${spainMatch.score.team1}, Team2: ${spainMatch.score.team2}`);
        console.log(`Predictions Scored: ${spainMatch.predictionsScored}`);

        // Find predictions for this match
        console.log("\n=== PREDICTIONS FOR THIS MATCH ===");
        const predsSnap = await db.collection('predictions')
            .where('matchId', '==', spainMatch.id)
            .get();

        console.log(`Total predictions: ${predsSnap.size}`);

        predsSnap.forEach(doc => {
            const pred = doc.data();
            console.log(`\nUser: ${pred.userId}`);
            console.log(`  Predicted: ${pred.predictedResult} / ${pred.predictedGoalsTier}`);
            console.log(`  Result Correct: ${pred.resultCorrect}`);
            console.log(`  Goals Correct: ${pred.goalsCorrect}`);
            console.log(`  Points Awarded: ${pred.pointsAwarded}`);
        });

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

diagnose();
