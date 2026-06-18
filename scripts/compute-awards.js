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
        console.error("No Firebase credentials found. Set FIREBASE_SERVICE_ACCOUNT or place the service account JSON in the project root.");
        process.exit(1);
    }
}

initializeApp({ credential: cert(serviceAccount) });
const db = getFirestore();

async function main() {
    // ── Fetch raw data ────────────────────────────────────────────────────────
    const [usersSnap, predsSnap, matchesSnap] = await Promise.all([
        db.collection('users').get(),
        db.collection('predictions').get(),
        db.collection('matches').get(),
    ]);

    const users = {};
    usersSnap.forEach(d => { users[d.id] = { id: d.id, ...d.data() }; });

    const matches = {};
    matchesSnap.forEach(d => { matches[d.id] = { id: d.id, ...d.data() }; });

    // Group predictions by user and by match
    const byUser = {};   // userId → [pred, ...]
    const byMatch = {};  // matchId → [pred, ...]

    predsSnap.forEach(d => {
        const p = { id: d.id, ...d.data() };
        if (!byUser[p.userId])  byUser[p.userId]  = [];
        if (!byMatch[p.matchId]) byMatch[p.matchId] = [];
        byUser[p.userId].push(p);
        byMatch[p.matchId].push(p);
    });

    const finishedMatchIds = Object.values(matches)
        .filter(m => m.status === 'FINISHED')
        .map(m => m.id);

    const name = (uid) => users[uid]?.displayName || users[uid]?.email?.split('@')[0] || `User_${uid.substring(0,5)}`;

    // ── Helper: majority pick for a match ────────────────────────────────────
    function majority(matchId) {
        const dist = matches[matchId]?.communityStats?.resultDistribution || {};
        let top = null, topCount = -1;
        for (const [k, v] of Object.entries(dist)) {
            if (v > topCount) { topCount = v; top = k; }
        }
        return top;
    }

    // ── Per-user aggregates ───────────────────────────────────────────────────
    const stats = {};
    for (const uid of Object.keys(byUser)) {
        const preds = byUser[uid];
        const finished = preds.filter(p => finishedMatchIds.includes(p.matchId));

        let popularitySum = 0, popularityCount = 0;
        let timesWithMajority = 0, timesWithMajorityWrong = 0;
        let timesAgainstMajority = 0, timesAgainstMajorityCorrect = 0, timesAgainstMajorityWrong = 0;
        let drawCount = 0, team1Count = 0, team2Count = 0;
        let tier0_1 = 0, tier2_3 = 0, tier4plus = 0, tierBlank = 0;
        let perfect6 = 0, halfRight3 = 0;
        let goalsOnAll = true;

        for (const p of preds) {
            const m = matches[p.matchId];
            if (!m) continue;

            if (p.predictedGoalsTier == null) goalsOnAll = false;
            if (p.predictedGoalsTier === '0-1') tier0_1++;
            else if (p.predictedGoalsTier === '2-3') tier2_3++;
            else if (p.predictedGoalsTier === '4+') tier4plus++;
            else tierBlank++;

            if (p.predictedResult === 'draw') drawCount++;
            else if (p.predictedResult === 'team1') team1Count++;
            else if (p.predictedResult === 'team2') team2Count++;

            if (m.status !== 'FINISHED') continue;

            const cs = m.communityStats;
            if (!cs || !cs.totalPredictions) continue;

            const total = cs.totalPredictions;
            const myPickCount = cs.resultDistribution?.[p.predictedResult] || 0;
            const popScore = myPickCount / total;
            popularitySum += popScore;
            popularityCount++;

            const maj = majority(p.matchId);
            const withMaj = p.predictedResult === maj;
            if (withMaj) {
                timesWithMajority++;
                if (p.resultCorrect === false) timesWithMajorityWrong++;
            } else {
                timesAgainstMajority++;
                if (p.resultCorrect === true)  timesAgainstMajorityCorrect++;
                if (p.resultCorrect === false) timesAgainstMajorityWrong++;
            }

            if (p.resultCorrect === true && p.goalsCorrect === true) perfect6++;
            else if (
                (p.resultCorrect === true && p.goalsCorrect === false) ||
                (p.resultCorrect === false && p.goalsCorrect === true)
            ) halfRight3++;
        }

        stats[uid] = {
            name: name(uid),
            totalPreds: preds.length,
            finishedPreds: finished.length,
            avgPopularity: popularityCount > 0 ? popularitySum / popularityCount : 1,
            timesWithMajority,
            timesWithMajorityWrong,
            timesAgainstMajority,
            timesAgainstMajorityCorrect,
            timesAgainstMajorityWrong,
            drawCount,
            team1Count,
            team2Count,
            tier0_1,
            tier2_3,
            tier4plus,
            tierBlank,
            perfect6,
            halfRight3,
            goalsOnAll,
            totalPoints: users[uid]?.totalPoints || 0,
            correctPredictions: users[uid]?.correctPredictions || 0,
            correctGoals: users[uid]?.correctGoals || 0,
        };
    }

    const eligible = Object.values(stats).filter(s => s.finishedPreds >= 3);

    // ── Award winners ─────────────────────────────────────────────────────────
    const awards = [
        {
            title: '🦄 NotLikeOthers',
            desc: 'Picked the minority option more than anyone else (lowest avg popularity score)',
            winner: [...eligible].sort((a, b) => a.avgPopularity - b.avgPopularity)[0],
        },
        {
            title: '🐑 The Sheep',
            desc: 'Always voted with the crowd — highest avg popularity score',
            winner: [...eligible].sort((a, b) => b.avgPopularity - a.avgPopularity)[0],
        },
        {
            title: '🔮 The Oracle',
            desc: 'Highest result accuracy % (correctPredictions / finishedPreds)',
            winner: [...eligible].sort((a, b) =>
                (b.correctPredictions / b.finishedPreds) - (a.correctPredictions / a.finishedPreds)
            )[0],
        },
        {
            title: '🎯 The Sniper',
            desc: 'Most 6-point perfect predictions (both result + goals correct)',
            winner: [...eligible].sort((a, b) => b.perfect6 - a.perfect6)[0],
        },
        {
            title: '💀 The Cursed One',
            desc: 'Most times went with majority AND they were wrong together',
            winner: [...eligible].sort((a, b) => b.timesWithMajorityWrong - a.timesWithMajorityWrong)[0],
        },
        {
            title: '🎰 The Contrarian Genius',
            desc: 'Most times picked minority AND was correct',
            winner: [...eligible].sort((a, b) => b.timesAgainstMajorityCorrect - a.timesAgainstMajorityCorrect)[0],
        },
        {
            title: '😩 The Contrarian Idiot',
            desc: 'Most times picked minority AND was wrong',
            winner: [...eligible].sort((a, b) => b.timesAgainstMajorityWrong - a.timesAgainstMajorityWrong)[0],
        },
        {
            title: '🤌 Half Right',
            desc: 'Most 3-point games (exactly one of result/goals correct, never both)',
            winner: [...eligible].sort((a, b) => b.halfRight3 - a.halfRight3)[0],
        },
        {
            title: '🤝 Draw Merchant',
            desc: 'Most draws predicted',
            winner: [...Object.values(stats)].sort((a, b) => b.drawCount - a.drawCount)[0],
        },
        {
            title: '💥 Festival of Football',
            desc: 'Most 4+ goals tier predictions',
            winner: [...Object.values(stats)].sort((a, b) => b.tier4plus - a.tier4plus)[0],
        },
        {
            title: '🧱 Il Catenaccio',
            desc: 'Most 0-1 goals tier predictions',
            winner: [...Object.values(stats)].sort((a, b) => b.tier0_1 - a.tier0_1)[0],
        },
        {
            title: '📊 The Analyst',
            desc: 'Never left goals tier blank — predicted it on every single match',
            winner: Object.values(stats).find(s => s.goalsOnAll && s.totalPreds > 0) || null,
        },
        {
            title: '😴 The Ghost',
            desc: 'Fewest total predictions submitted',
            winner: [...Object.values(stats)].sort((a, b) => a.totalPreds - b.totalPreds)[0],
        },
        {
            title: '🏠 Homeboy',
            desc: 'Most team1 (home side) wins predicted',
            winner: [...Object.values(stats)].sort((a, b) => b.team1Count - a.team1Count)[0],
        },
        {
            title: '✈️ The Pilgrim',
            desc: 'Most team2 (away side) wins predicted',
            winner: [...Object.values(stats)].sort((a, b) => b.team2Count - a.team2Count)[0],
        },
    ];

    // ── Champion Whisperer ────────────────────────────────────────────────────
    const winnerPicks = {};
    usersSnap.forEach(d => {
        const wp = d.data().winnerPrediction;
        if (wp) winnerPicks[wp] = (winnerPicks[wp] || 0) + 1;
    });
    const sortedPicks = Object.entries(winnerPicks).sort((a, b) => a[1] - b[1]);
    const rarestPick = sortedPicks[0]?.[0];
    if (rarestPick) {
        const whisperers = usersSnap.docs
            .filter(d => d.data().winnerPrediction === rarestPick)
            .map(d => name(d.id));
        awards.push({
            title: '🏆 Champion Whisperer',
            desc: `Picked "${rarestPick}" — chosen by only ${sortedPicks[0][1]} player(s)`,
            winner: { name: whisperers.join(', ') },
        });
    }

    // ── Print results ─────────────────────────────────────────────────────────
    console.log('\n════════════════════════════════════════════════════');
    console.log('        PREDICT26 — ROUND 1 AWARDS');
    console.log('════════════════════════════════════════════════════\n');

    for (const award of awards) {
        const winnerName = award.winner?.name || '—';
        console.log(`${award.title}`);
        console.log(`   Winner : ${winnerName}`);
        console.log(`   Criteria: ${award.desc}`);
        console.log('');
    }

    // ── Full leaderboard for context ──────────────────────────────────────────
    console.log('════════════════════════════════════════════════════');
    console.log('  ALL PLAYERS — ROUND 1 STATS');
    console.log('════════════════════════════════════════════════════');
    const all = Object.values(stats).sort((a, b) => b.totalPoints - a.totalPoints);
    for (const s of all) {
        console.log(
            `${s.name.padEnd(20)} | pts:${String(s.totalPoints).padStart(3)} | res:${s.correctPredictions} | goals:${s.correctGoals} | perfect:${s.perfect6} | halfRight:${s.halfRight3} | preds:${s.totalPreds}`
        );
    }
}

main().catch(e => { console.error(e); process.exit(1); });
