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
        console.error('No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT env var.');
        process.exit(1);
    }
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function backfillDisplayNames() {
    // 1. Load all users into a map: userId → displayName
    console.log('Fetching users...');
    const usersSnap = await db.collection('users').get();
    const userMap = {};
    usersSnap.forEach(doc => {
        const data = doc.data();
        userMap[doc.id] = data.displayName || data.email || null;
    });
    console.log(`Loaded ${Object.keys(userMap).length} users.`);

    // 2. Fetch predictions missing displayName
    console.log('Fetching predictions without displayName...');
    const predsSnap = await db.collection('predictions').get();

    let toUpdate = [];
    predsSnap.forEach(doc => {
        const data = doc.data();
        if (!data.displayName && data.userId) {
            const name = userMap[data.userId];
            if (name) toUpdate.push({ ref: doc.ref, displayName: name });
        }
    });
    console.log(`${toUpdate.length} predictions need backfilling.`);

    if (toUpdate.length === 0) {
        console.log('Nothing to do.');
        return;
    }

    // 3. Batch-write displayName back
    let batch = db.batch();
    let count = 0;
    for (const { ref, displayName } of toUpdate) {
        batch.update(ref, { displayName });
        count++;
        if (count % 400 === 0) {
            await batch.commit();
            batch = db.batch();
            console.log(`  committed ${count}...`);
        }
    }
    if (count % 400 !== 0) await batch.commit();

    console.log(`Done. Backfilled displayName on ${count} predictions.`);
}

backfillDisplayNames().catch(err => { console.error(err); process.exit(1); });
