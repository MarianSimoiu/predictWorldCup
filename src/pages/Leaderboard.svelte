<script>
    import { collection, query, onSnapshot, doc } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import { userStore } from '../lib/stores.svelte.js';
    import { push } from 'svelte-spa-router';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let leaderboard = $state([]);
    let loading = $state(true);
    let error = $state(null);

    let lastSyncTime = $state(null);
    let syncStatus = $state('success');
    let timeRemainingStr = $state('');
    let tournamentFinal = $state(false);

    let syncFailed = $derived(syncStatus === 'failed');

    let lastSyncDateLabel = $derived.by(() => {
        if (!lastSyncTime) return '';
        const today = new Date();
        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        const isYesterday = lastSyncTime.toDateString() === yesterday.toDateString();
        return isYesterday ? 'Yesterday' : lastSyncTime.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    });

    let filteredLeaderboard = $derived(leaderboard.map((user, i) => ({ ...user, rank: i + 1 })));

    let activeTab = $state('leaderboard');

    let currentUserIsPaid = $derived(
        leaderboard.find(u => u.id === userStore.user?.uid)?.hasPaid ?? false
    );

    // Paid users in ranked order (prizes go to top 3 among paid participants)
    let paidLeaderboard = $derived(filteredLeaderboard.filter(u => u.hasPaid));

    const ENTRY_FEE = 50;
    let prizePool   = $derived(paidLeaderboard.length * ENTRY_FEE);
    let firstPrize  = $derived(Math.round(prizePool * 0.50));
    let secondPrize = $derived(Math.round(prizePool * 0.30));
    let thirdPrize  = $derived(Math.round(prizePool * 0.20));

    $effect(() => {
        if (!userStore.user) {
            push('/');
            return;
        }

        const unsubscribeStatus = onSnapshot(doc(db, 'system', 'status'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.lastSync) lastSyncTime = data.lastSync.toDate();
                if (data.status) syncStatus = data.status;
                tournamentFinal = !!data.tournamentFinal;
            }
        });

        return unsubscribeStatus;
    });

    $effect(() => {
        if (syncFailed) return;
        const updateCountdown = () => {
            const now = new Date();
            const next10AM = new Date(now);
            next10AM.setHours(10, 0, 0, 0); // 10 AM (UTC+2)

            // If it's already past 10 AM today, next sync is tomorrow at 10 AM
            if (now >= next10AM) {
                next10AM.setDate(next10AM.getDate() + 1);
            }

            const diffMs = next10AM.getTime() - now.getTime();
            const hours = Math.floor(diffMs / 3600000);
            const mins = Math.floor((diffMs % 3600000) / 60000);
            const secs = Math.floor((diffMs % 60000) / 1000);
            timeRemainingStr = `${hours}h ${mins}m ${secs.toString().padStart(2, '0')}s`;
        };

        updateCountdown();
        const timer = setInterval(updateCountdown, 1000);
        return () => clearInterval(timer);
    });

    $effect(() => {
        if (!userStore.user) return;

        const q = query(collection(db, 'users'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const rawData = [];
            snapshot.forEach((doc) => {
                rawData.push({ id: doc.id, ...doc.data() });
            });
            
            // Sort client-side by Points -> Exact Results -> Goals Predictions
            rawData.sort((a, b) => {
                const ptsA = a.totalPoints || 0;
                const ptsB = b.totalPoints || 0;
                if (ptsA !== ptsB) return ptsB - ptsA;
                
                const exactA = a.correctPredictions || 0;
                const exactB = b.correctPredictions || 0;
                if (exactA !== exactB) return exactB - exactA;
                
                const goalsA = a.correctGoals || 0;
                const goalsB = b.correctGoals || 0;
                return goalsB - goalsA;
            });
            
            let rank = 1;
            const data = rawData.map(user => {
                return { ...user, rank: rank++ };
            });
            
            leaderboard = data;
            loading = false;
            error = null;
        }, (err) => {
            console.error("Leaderboard loading error:", err);
            loading = false;
            error = err.message || String(err);
        });

        return unsubscribe;
    });
</script>

<div class="leaderboard-page">
    <h1>🏆 Leaderboard</h1>

    {#if tournamentFinal}
        <div class="final-banner">
            <span class="final-trophy">🏆</span>
            <div class="final-text">
                <span class="final-title">FINAL STANDINGS</span>
                <span class="final-sub">Tournament complete — no further updates</span>
            </div>
            <span class="final-trophy">🏆</span>
        </div>
    {:else if lastSyncTime}
        <div class="sync-banner" class:sync-banner-paused={syncFailed}>
            <div class="sync-banner-item">
                <span class="dot" class:pulse-success={!syncFailed} class:dot-paused={syncFailed}>●</span>
                <span class="label">Last updated:</span>
                <span class="value">{lastSyncDateLabel} at {lastSyncTime.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
            {#if syncFailed}
                <div class="sync-banner-item">
                    <span class="dot dot-paused">●</span>
                    <span class="label paused-label">Scores paused — update coming soon</span>
                </div>
            {:else if timeRemainingStr}
                <div class="sync-banner-item">
                    <span class="dot pulse-accent">●</span>
                    <span class="label">Next update tomorrow at 10:00:</span>
                    <span class="value countdown">{timeRemainingStr}</span>
                </div>
            {/if}
        </div>
    {/if}

    {#if currentUserIsPaid}
        <div class="tabs">
            <button class="tab-btn" class:tab-active={activeTab === 'leaderboard'} onclick={() => activeTab = 'leaderboard'}>
                🏆 Rankings
            </button>
            <button class="tab-btn" class:tab-active={activeTab === 'prizes'} onclick={() => activeTab = 'prizes'}>
                💰 Prize Pool
            </button>
        </div>
    {/if}

    {#if error}
        <ErrorMessage error={error} context="Leaderboard" />
    {:else if loading}
        <div class="loading">Loading rankings...</div>
    {:else if activeTab === 'prizes'}
        <!-- ── PRIZE TAB ── -->
        <div class="prize-tab">
            <div class="prize-pool-card">
                <div class="prize-pool-title">Prize Pool</div>
                <div class="prize-pool-amount">{prizePool} lei</div>
                <div class="prize-pool-sub">{paidLeaderboard.length} participants × {ENTRY_FEE} lei entry fee</div>
            </div>

            <div class="prize-winners">
                {#each [{rank:1, user: paidLeaderboard[0], prize: firstPrize, pct:'50%', medal:'🥇'},
                        {rank:2, user: paidLeaderboard[1], prize: secondPrize, pct:'30%', medal:'🥈'},
                        {rank:3, user: paidLeaderboard[2], prize: thirdPrize,  pct:'20%', medal:'🥉'}] as w}
                    {#if w.user}
                        <div class="prize-winner-row prize-rank-{w.rank}">
                            <span class="pw-medal">{w.medal}</span>
                            <div class="pw-info">
                                <span class="pw-name">{w.user.displayName || w.user.email?.split('@')[0] || w.user.id.substring(0,6)}</span>
                                <span class="pw-pts">{w.user.totalPoints} pts</span>
                            </div>
                            <div class="pw-prize">
                                <span class="pw-amount">{w.prize} lei</span>
                                <span class="pw-pct">{w.pct}</span>
                            </div>
                        </div>
                    {/if}
                {/each}
            </div>

            <div class="paid-list-section">
                <div class="paid-list-title">💰 Paid Participants ({paidLeaderboard.length})</div>
                <div class="paid-list">
                    {#each paidLeaderboard as u}
                        <div class="paid-list-row">
                            <span class="paid-rank">#{u.rank}</span>
                            <span class="paid-name">{u.displayName || u.email?.split('@')[0] || u.id.substring(0,6)}</span>
                            <span class="paid-pts">{u.totalPoints} pts</span>
                            <span class="paid-badge">✅ Paid</span>
                        </div>
                    {/each}
                </div>
            </div>
        </div>
    {:else}
        <div class="lb-container">
            <!-- Header -->
            <div class="lb-row lb-header">
                <span class="col-rank">#</span>
                <span class="col-name">Predictor</span>
                <span class="col-pts">Pts</span>
                <span class="col-results desktop-only">
                    Results
                    <span class="tip" data-tip="Correct result predictions: Win/Draw/Loss in group stage, advancing team in knockout rounds">ℹ️</span>
                </span>
                <span class="col-goals desktop-only">
                    Goals
                    <span class="tip" data-tip="Correct 90-min goals tier predictions (0-1 / 2-3 / 4+) — group stage and knockout rounds">ℹ️</span>
                </span>
                <span class="col-double desktop-only">
                    ⚡ Double
                    <span class="tip" data-tip="Correct result + goals predictions on Double Points matches (2 possible per match)">ℹ️</span>
                </span>
                <span class="col-joker desktop-only">
                    🃏 Joker
                    <span class="tip" data-tip="Points earned from Joker Card prediction">ℹ️</span>
                </span>
                <span class="col-champ desktop-only">
                    🏆 Champ
                    <span class="tip" data-tip="Champion prediction bonus: +16 picked the winner / +10 finalist / +6 third place">ℹ️</span>
                </span>
            </div>

            {#each filteredLeaderboard as user (user.id)}
                <div class="lb-row" class:top-3={user.rank <= 3}>
                    <div class="col-rank">
                        {#if user.rank === 1}🥇
                        {:else if user.rank === 2}🥈
                        {:else if user.rank === 3}🥉
                        {:else}<span class="rank-num">{user.rank}</span>{/if}
                    </div>
                    <div class="col-name">
                        <span class="username">
                            {user.displayName || user.email?.split('@')[0] || `User_${user.id.substring(0, 5)}`}
                        </span>
                        <span class="mobile-stats">
                            ✓ {user.correctPredictions || 0} · ⚽ {user.correctGoals || 0}
                            {#if user.doubleTotal > 0} · ⚡ {user.doubleCorrect || 0}/{user.doubleTotal}{/if}
                            {#if user.jokerCorrect !== null && user.jokerCorrect !== undefined} · 🃏 {user.jokerPoints || 0}pts{/if}
                            {#if (user.championBonus ?? 0) > 0} · 🏆 +{user.championBonus}pts{/if}
                        </span>
                    </div>
                    <div class="col-pts">{user.totalPoints || 0}</div>
                    <div class="col-results desktop-only">{user.correctPredictions || 0}</div>
                    <div class="col-goals desktop-only">{user.correctGoals || 0}</div>
                    <div class="col-double desktop-only">
                        {#if user.doubleTotal > 0}
                            <span class="double-stat">{user.doubleCorrect || 0}<span class="stat-denom">/{user.doubleTotal}</span></span>
                        {:else}
                            <span class="stat-na">—</span>
                        {/if}
                    </div>
                    <div class="col-joker desktop-only">
                        {#if user.jokerCorrect !== null && user.jokerCorrect !== undefined}
                            <span class="joker-stat" class:joker-good={user.jokerCorrect} class:joker-miss={!user.jokerCorrect}>
                                {user.jokerPoints || 0}pts
                            </span>
                        {:else}
                            <span class="stat-na">—</span>
                        {/if}
                    </div>
                    <div class="col-champ desktop-only">
                        {#if (user.championBonus ?? 0) > 0}
                            <span class="champ-bonus">+{user.championBonus}pts</span>
                        {:else}
                            <span class="stat-na">—</span>
                        {/if}
                    </div>
                </div>
            {/each}

            {#if filteredLeaderboard.length === 0}
                <div class="empty-msg">No participants found yet.</div>
            {/if}
        </div>
    {/if}
</div>


<style>
    .leaderboard-page {
        padding: clamp(0.75rem, 3vw, 2rem);
        max-width: 1100px;
        margin: 0 auto;
        width: 100%;
        box-sizing: border-box;
    }
    h1 {
        text-align: center;
        color: var(--color-accent);
        margin-bottom: clamp(1rem, 3vw, 2rem);
        font-size: clamp(1.5rem, 5vw, 2.5rem);
    }

    /* Leaderboard grid */
    .lb-container {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 16px;
        overflow: hidden;
    }

    /* Each row: 8-column grid (3 bonus cols hidden on mobile) */
    .lb-row {
        display: grid;
        grid-template-columns: 56px 1fr 80px 80px 80px 80px 80px 80px;
        align-items: center;
        padding: clamp(0.65rem, 2vw, 1rem) clamp(1rem, 3vw, 1.75rem);
        border-bottom: 1px solid rgba(255,255,255,0.05);
        transition: background 0.15s;
    }
    .lb-row:last-child { border-bottom: none; }
    .lb-row:not(.lb-header):hover { background: rgba(255,255,255,0.03); }

    .lb-header {
        background: rgba(0,0,0,0.2);
        font-size: clamp(0.65rem, 1.8vw, 0.78rem);
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        color: #aaa;
    }
    .lb-row.top-3 {
        background: linear-gradient(90deg, rgba(251,191,36,0.08) 0%, transparent 60%);
    }

    /* Columns */
    .col-rank {
        text-align: center;
        font-size: clamp(1rem, 3.5vw, 1.3rem);
    }
    .rank-num {
        font-size: clamp(0.85rem, 2.5vw, 1.05rem);
        color: #888;
        font-weight: 700;
    }
    .col-name {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        padding-right: 0.75rem;
    }
    .username {
        font-size: clamp(0.85rem, 2.5vw, 1rem);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .top-3 .username { color: var(--color-accent); }
    .mobile-stats {
        display: none;
        font-size: clamp(0.65rem, 1.8vw, 0.72rem);
        color: #666;
    }
    .col-pts {
        font-size: clamp(1rem, 3vw, 1.3rem);
        font-weight: 800;
        color: var(--color-primary);
        text-align: center;
    }
    .col-results, .col-goals {
        text-align: center;
        font-size: clamp(0.9rem, 2.5vw, 1.05rem);
        color: #aaa;
        font-weight: 500;
    }

    .col-double, .col-joker, .col-champ {
        text-align: center;
        font-size: clamp(0.85rem, 2.5vw, 1rem);
    }
    .double-stat  { color: #aaa; font-weight: 600; }
    .stat-denom   { color: #555; font-size: 0.85em; }
    .stat-na      { color: #444; }
    .joker-stat   { font-weight: 700; }
    .joker-good   { color: #4ade80; }
    .joker-miss   { color: #ef4444; }
    .champ-bonus  { font-weight: 700; color: #fbbf24; }

    /* Wide screens: more generous spacing */
    @media (min-width: 900px) {
        .lb-row {
            grid-template-columns: 64px 1fr 100px 90px 90px 90px 90px 90px;
            padding: 1.1rem 2rem;
        }
        .lb-header { font-size: 0.82rem; }
        .username  { font-size: 1.05rem; }
        .col-pts   { font-size: 1.35rem; }
        .col-results, .col-goals, .col-double, .col-joker, .col-champ { font-size: 1rem; }
        .rank-num  { font-size: 1.05rem; }
        .col-rank  { font-size: 1.35rem; }
    }

    /* Tooltip on header */
    .tip {
        cursor: help;
        display: inline-block;
        margin-left: 3px;
        position: relative;
        font-size: 0.8em;
    }
    .tip::after {
        content: attr(data-tip);
        position: absolute;
        bottom: 150%;
        left: 50%;
        transform: translateX(-50%);
        background: #222;
        color: #fff;
        padding: 6px 10px;
        border-radius: 6px;
        font-size: 0.72rem;
        white-space: nowrap;
        opacity: 0;
        visibility: hidden;
        transition: opacity 0.2s, visibility 0.2s;
        box-shadow: 0 4px 6px rgba(0,0,0,0.3);
        z-index: 10;
        border: 1px solid rgba(255,255,255,0.1);
        pointer-events: none;
        font-weight: normal;
        text-transform: none;
        letter-spacing: normal;
    }
    .tip:hover::after { opacity: 1; visibility: visible; }

    .empty-msg {
        text-align: center;
        color: #888;
        font-style: italic;
        padding: 2rem;
    }

    /* Final banner */
    .final-banner {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        margin-bottom: clamp(1rem, 3vw, 2rem);
        background: linear-gradient(135deg, rgba(251,191,36,0.15) 0%, rgba(251,191,36,0.05) 100%);
        border: 1px solid rgba(251,191,36,0.35);
        padding: 0.75rem 1.5rem;
        border-radius: 50px;
        width: fit-content;
        margin-left: auto;
        margin-right: auto;
    }
    .final-trophy { font-size: 1.3rem; }
    .final-text {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
    }
    .final-title {
        font-size: clamp(0.8rem, 2.5vw, 0.95rem);
        font-weight: 800;
        letter-spacing: 0.12em;
        color: #fbbf24;
        text-transform: uppercase;
    }
    .final-sub {
        font-size: clamp(0.65rem, 1.8vw, 0.75rem);
        color: #888;
    }

    /* Sync banner */
    .sync-banner {
        display: flex;
        justify-content: center;
        gap: clamp(1rem, 4vw, 2rem);
        margin-bottom: clamp(1rem, 3vw, 2rem);
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.08);
        padding: 0.6rem 1.2rem;
        border-radius: 50px;
        width: fit-content;
        margin-left: auto;
        margin-right: auto;
        flex-wrap: wrap;
    }
    .sync-banner-item {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: clamp(0.75rem, 2vw, 0.85rem);
    }
    .sync-banner-item .dot { font-size: 0.75rem; }
    .dot.pulse-success { color: var(--color-success); animation: pulse 2s infinite; }
    .dot.pulse-accent  { color: var(--color-accent);  animation: pulse 1s infinite; }
    .dot.dot-paused    { color: #888; }
    .sync-banner-paused {
        border-color: rgba(255,255,255,0.05);
        background: rgba(255,255,255,0.02);
    }
    .sync-banner-item .label { color: #888; }
    .sync-banner-item .paused-label { color: #666; font-style: italic; }
    .sync-banner-item .value { color: white; font-weight: 600; }
    .sync-banner-item .value.countdown {
        font-family: monospace;
        color: var(--color-accent);
    }

    /* Tablet: hide bonus cols, keep results/goals */
    @media (max-width: 700px) {
        .lb-row {
            grid-template-columns: 48px 1fr 70px 64px 64px;
        }
        .col-double, .col-joker, .col-champ { display: none; }
        .mobile-stats { display: none; }
    }

    /* Mobile: collapse to 3 columns, show full sub-line */
    @media (max-width: 500px) {
        .lb-row {
            grid-template-columns: 36px 1fr 48px;
        }
        .desktop-only { display: none; }
        .mobile-stats { display: block; }
        .col-pts { font-size: clamp(0.95rem, 4vw, 1.1rem); }
    }

    @keyframes pulse {
        0%, 100% { opacity: 0.5; }
        50% { opacity: 1; }
    }

    /* ── Tabs ── */
    .tabs {
        display: flex;
        gap: 0.5rem;
        margin-bottom: clamp(1rem, 3vw, 1.5rem);
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 12px;
        padding: 4px;
    }
    .tab-btn {
        flex: 1;
        padding: 0.55rem 1rem;
        border: none;
        border-radius: 9px;
        background: transparent;
        color: #888;
        font-size: clamp(0.8rem, 2.2vw, 0.9rem);
        font-weight: 600;
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
    }
    .tab-btn:hover { color: #ccc; }
    .tab-btn.tab-active {
        background: rgba(255,255,255,0.1);
        color: #fff;
    }

    /* ── Prize Tab ── */
    .prize-tab {
        display: flex;
        flex-direction: column;
        gap: 1.25rem;
    }
    .prize-pool-card {
        background: linear-gradient(135deg, rgba(251,191,36,0.18) 0%, rgba(251,191,36,0.06) 100%);
        border: 1px solid rgba(251,191,36,0.35);
        border-radius: 16px;
        padding: clamp(1.25rem, 4vw, 2rem);
        text-align: center;
    }
    .prize-pool-title {
        font-size: clamp(0.75rem, 2vw, 0.85rem);
        text-transform: uppercase;
        letter-spacing: 0.1em;
        color: #888;
        font-weight: 600;
        margin-bottom: 0.4rem;
    }
    .prize-pool-amount {
        font-size: clamp(2.2rem, 8vw, 3.5rem);
        font-weight: 900;
        color: #fbbf24;
        line-height: 1;
    }
    .prize-pool-sub {
        margin-top: 0.4rem;
        font-size: clamp(0.75rem, 2vw, 0.85rem);
        color: #666;
    }

    .prize-winners {
        display: flex;
        flex-direction: column;
        gap: 0.6rem;
    }
    .prize-winner-row {
        display: flex;
        align-items: center;
        gap: 1rem;
        padding: clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 1.5rem);
        border-radius: 12px;
        border: 1px solid transparent;
    }
    .prize-rank-1 { background: rgba(251,191,36,0.12); border-color: rgba(251,191,36,0.3); }
    .prize-rank-2 { background: rgba(148,163,184,0.1); border-color: rgba(148,163,184,0.25); }
    .prize-rank-3 { background: rgba(180,120,60,0.1);  border-color: rgba(180,120,60,0.25); }

    .pw-medal { font-size: 1.6rem; flex-shrink: 0; }
    .pw-info  { flex: 1; display: flex; flex-direction: column; gap: 0.1rem; }
    .pw-name  { font-weight: 700; font-size: clamp(0.9rem, 2.5vw, 1.05rem); }
    .pw-pts   { font-size: clamp(0.72rem, 1.8vw, 0.8rem); color: #666; }
    .pw-prize { text-align: right; flex-shrink: 0; }
    .pw-amount { display: block; font-size: clamp(1.1rem, 3.5vw, 1.4rem); font-weight: 800; color: #fbbf24; }
    .pw-pct    { display: block; font-size: 0.72rem; color: #555; }

    .prize-rank-1 .pw-name { color: #fbbf24; }
    .prize-rank-2 .pw-name { color: #94a3b8; }
    .prize-rank-3 .pw-name { color: #b47c3c; }

    .paid-list-section {
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 16px;
        overflow: hidden;
    }
    .paid-list-title {
        padding: 0.75rem 1.25rem;
        font-size: clamp(0.72rem, 1.8vw, 0.8rem);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: #666;
        background: rgba(0,0,0,0.2);
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .paid-list { display: flex; flex-direction: column; }
    .paid-list-row {
        display: grid;
        grid-template-columns: 36px 1fr auto auto;
        align-items: center;
        gap: 0.75rem;
        padding: 0.6rem 1.25rem;
        border-bottom: 1px solid rgba(255,255,255,0.04);
        font-size: clamp(0.8rem, 2.2vw, 0.9rem);
    }
    .paid-list-row:last-child { border-bottom: none; }
    .paid-rank  { color: #555; font-size: 0.78rem; font-weight: 700; }
    .paid-name  { font-weight: 600; }
    .paid-pts   { color: #888; font-size: 0.82rem; }
    .paid-badge { color: #10b981; font-size: 0.75rem; font-weight: 700; }
</style>
