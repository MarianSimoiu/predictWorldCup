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

async function debug() {
    try {
        // Get all upcoming matches (not finished)
        const matchesSnap = await db.collection('matches')
            .where('status', '!=', 'FINISHED')
            .get();

        console.log(`\nFound ${matchesSnap.size} upcoming matches\n`);

        // Group by stage
        const stageGroups = {};
        matchesSnap.forEach(doc => {
            const data = doc.data();
            const stage = data.stage || 'UNKNOWN';
            if (!stageGroups[stage]) {
                stageGroups[stage] = [];
            }
            stageGroups[stage].push({
                id: doc.id,
                team1: data.team1?.name,
                team2: data.team2?.name,
                status: data.status
            });
        });

        // Display results
        Object.entries(stageGroups).forEach(([stage, matches]) => {
            console.log(`\n=== STAGE: "${stage}" (${matches.length} matches) ===`);
            matches.slice(0, 2).forEach(m => {
                console.log(`  ${m.team1} vs ${m.team2} (${m.status})`);
            });
        });

        process.exit(0);
    } catch (error) {
        console.error("Error:", error);
        process.exit(1);
    }
}

debug();
