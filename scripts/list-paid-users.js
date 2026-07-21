/**
 * Admin script: list all users where isPaid === true in Firestore.
 *
 * Usage:
 *   FIREBASE_SERVICE_ACCOUNT='...' node scripts/list-paid-users.js
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

const snap = await db.collection('users').where('isPaid', '==', true).get();

console.log(`Found ${snap.size} paid user(s):\n`);

snap.forEach((doc) => {
    const u = doc.data();
    console.log(`  ID:          ${doc.id}`);
    console.log(`  displayName: ${u.displayName || '(none)'}`);
    console.log(`  email:       ${u.email || '(none)'}`);
    console.log(`  isPaid:      ${u.isPaid}`);
    console.log(`  totalPoints: ${u.totalPoints ?? 0}`);
    console.log();
});

process.exit(0);
