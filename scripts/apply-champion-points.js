/**
 * Admin script: apply champion prediction bonus points to all users.
 *
 * Reads config/championResult from Firestore and awards:
 *   +16 pts — user predicted the tournament winner
 *   +10 pts — user predicted the finalist
 *   +6  pts — user predicted the 3rd-place team
 *
 * Idempotent: skips users where championPointsAwarded is already true.
 * On completion, writes tournamentFinal: true to system/status so the
 * Leaderboard shows the "FINAL" banner.
 *
 * Env vars:
 *   FIREBASE_SERVICE_ACCOUNT – required in CI; falls back to local credentials file
 *   DRY_RUN=true             – print what would happen without writing anything
 */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
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

const DRY_RUN = process.env.DRY_RUN === 'true';
if (DRY_RUN) console.log('🔍 DRY RUN — no writes will be made\n');

// If env vars are provided, write/overwrite config/championResult first
const envWinner    = process.env.WINNER?.trim()     || '';
const envFinalist  = process.env.FINALIST?.trim()   || '';
const envThirdPlace = process.env.THIRD_PLACE?.trim() || '';

let winner, finalist, thirdPlace;

if (envWinner && envFinalist && envThirdPlace) {
    winner = envWinner;
    finalist = envFinalist;
    thirdPlace = envThirdPlace;
    console.log('Writing config/championResult from env vars...');
    if (!DRY_RUN) {
        await db.collection('config').doc('championResult').set({ winner, finalist, thirdPlace }, { merge: true });
        console.log('✅ config/championResult updated.\n');
    } else {
        console.log('(skipped in dry run)\n');
    }
} else {
    // Fall back to reading from Firestore
    const resultSnap = await db.collection('config').doc('championResult').get();
    if (!resultSnap.exists) {
        console.error('config/championResult not found. Pass WINNER / FINALIST / THIRD_PLACE env vars to set it.');
        process.exit(1);
    }
    ({ winner, finalist, thirdPlace } = resultSnap.data());
    if (!winner || !finalist || !thirdPlace) {
        console.error('championResult is missing one or more fields (winner / finalist / thirdPlace).');
        process.exit(1);
    }
}

console.log('Champion results:');
console.log(`  Winner (16 pts):     ${winner}`);
console.log(`  Finalist (10 pts):   ${finalist}`);
console.log(`  3rd place (6 pts):   ${thirdPlace}`);
console.log();

// Load all users
const usersSnap = await db.collection('users').get();
console.log(`Found ${usersSnap.size} users\n`);

let awarded = 0;
let skipped = 0;
let noPickCount = 0;

const batch = db.batch();

for (const userDoc of usersSnap.docs) {
    const u = userDoc.data();

    if (u.championPointsAwarded) {
        console.log(`  SKIP  ${u.displayName || userDoc.id} — already awarded ${u.championBonus ?? '?'} pts`);
        skipped++;
        continue;
    }

    const pick = u.winnerPrediction || null;
    let bonus = 0;
    let tier = null;

    if (pick === winner) {
        bonus = 16; tier = 'WINNER';
    } else if (pick === finalist) {
        bonus = 10; tier = 'FINALIST';
    } else if (pick === thirdPlace) {
        bonus = 6; tier = '3RD PLACE';
    }

    if (!pick) {
        console.log(`  —     ${u.displayName || userDoc.id} — no champion pick`);
        noPickCount++;
    } else if (bonus > 0) {
        console.log(`  +${bonus}  ${u.displayName || userDoc.id} — picked ${pick} (${tier})`);
    } else {
        console.log(`  +0    ${u.displayName || userDoc.id} — picked ${pick} (wrong)`);
    }

    if (!DRY_RUN) {
        batch.update(userDoc.ref, {
            totalPoints: FieldValue.increment(bonus),
            championBonus: bonus,
            championPickedTeam: pick || null,
            championPointsAwarded: true,
        });
    }
    awarded++;
}

console.log(`\nSummary:`);
console.log(`  Users to update: ${awarded}`);
console.log(`  Already awarded: ${skipped}`);
console.log(`  No pick:         ${noPickCount}`);

if (DRY_RUN) {
    console.log('\n🔍 DRY RUN complete — no changes written.');
    process.exit(0);
}

if (awarded > 0) {
    await batch.commit();
    console.log('\n✅ Champion points written to all users.');
} else {
    console.log('\nNothing to update.');
}

// Mark tournament as final in system/status
await db.collection('system').doc('status').set({
    tournamentFinal: true,
    championPointsAppliedAt: new Date(),
}, { merge: true });

console.log('✅ system/status.tournamentFinal = true — leaderboard will now show FINAL banner.');
process.exit(0);
