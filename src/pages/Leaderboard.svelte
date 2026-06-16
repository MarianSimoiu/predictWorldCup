<script>
    import { collection, query, onSnapshot, doc } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import { userStore } from '../lib/stores.svelte.js';
    import { push } from 'svelte-spa-router';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let leaderboard = $state([]);
    let loading = $state(true);
    let error = $state(null);
    let paidFilter = $state('all'); // 'all' | 'paid'
    
    let lastSyncTime = $state(null);
    let timeRemainingStr = $state('');

    let filteredLeaderboard = $derived.by(() => {
        const subset = paidFilter === 'paid'
            ? leaderboard.filter(u => u.hasPaid === true)
            : leaderboard;
        // Re-assign sequential ranks within the filtered subset
        return subset.map((user, i) => ({ ...user, rank: i + 1 }));
    });

    $effect(() => {
        if (!userStore.user) {
            push('/');
            return;
        }

        const unsubscribeStatus = onSnapshot(doc(db, 'system', 'status'), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                if (data.lastSync) {
                    lastSyncTime = data.lastSync.toDate();
                }
            }
        });

        return unsubscribeStatus;
    });

    $effect(() => {
        const updateCountdown = () => {
            const now = new Date();
            const nextHour = new Date(now);
            nextHour.setHours(now.getHours() + 1, 0, 0, 0);
            const diffMs = nextHour.getTime() - now.getTime();
            
            const mins = Math.floor(diffMs / 60000);
            const secs = Math.floor((diffMs % 60000) / 1000);
            timeRemainingStr = `${mins}m ${secs.toString().padStart(2, '0')}s`;
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

    {#if lastSyncTime || timeRemainingStr}
        <div class="sync-banner">
            {#if lastSyncTime}
                <div class="sync-banner-item">
                    <span class="dot pulse-success">●</span>
                    <span class="label">Last updated:</span>
                    <span class="value">{lastSyncTime.toLocaleTimeString()}</span>
                </div>
            {/if}
            {#if timeRemainingStr}
                <div class="sync-banner-item">
                    <span class="dot pulse-accent">●</span>
                    <span class="label">Next update in:</span>
                    <span class="value countdown">{timeRemainingStr}</span>
                </div>
            {/if}
        </div>
    {/if}

    {#if error}
        <ErrorMessage error={error} context="Leaderboard" />
    {:else if loading}
        <div class="loading">Loading rankings...</div>
    {:else}
        <div class="filter-bar">
            <span class="filter-label">Show:</span>
            <div class="filter-tabs">
                <button
                    class="filter-tab {paidFilter === 'all' ? 'active' : ''}"
                    onclick={() => paidFilter = 'all'}
                >🌍 All Predictors</button>
                <button
                    class="filter-tab {paidFilter === 'paid' ? 'active' : ''}"
                    onclick={() => paidFilter = 'paid'}
                >💰 Paid Only</button>
            </div>
        </div>

        <div class="lb-container">
            <!-- Header -->
            <div class="lb-row lb-header">
                <span class="col-rank">#</span>
                <span class="col-name">Predictor</span>
                <span class="col-pts">Pts</span>
                <span class="col-results desktop-only">
                    Results
                    <span class="tip" data-tip="Correct match outcome predictions (Win/Draw/Loss)">ℹ️</span>
                </span>
                <span class="col-goals desktop-only">
                    Goals
                    <span class="tip" data-tip="Correct total goals tier predictions (0-1 / 2-3 / 4+)">ℹ️</span>
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
                        {#if user.hasPaid}<span class="paid-badge" title="Paid">💰</span>{/if}
                        <!-- Mobile sub-line -->
                        <span class="mobile-stats">
                            ✓ {user.correctPredictions || 0} results · ⚽ {user.correctGoals || 0} goals
                        </span>
                    </div>
                    <div class="col-pts">{user.totalPoints || 0}</div>
                    <div class="col-results desktop-only">{user.correctPredictions || 0}</div>
                    <div class="col-goals desktop-only">{user.correctGoals || 0}</div>
                </div>
            {/each}

            {#if filteredLeaderboard.length === 0}
                <div class="empty-msg">No paid participants found yet.</div>
            {/if}
        </div>
    {/if}
</div>

<style>
    .leaderboard-page {
        padding: clamp(0.75rem, 3vw, 2rem);
        max-width: 800px;
        margin: 0 auto;
    }
    h1 {
        text-align: center;
        color: var(--color-accent);
        margin-bottom: clamp(1rem, 3vw, 2rem);
        font-size: clamp(1.5rem, 5vw, 2.5rem);
    }

    /* Filter bar */
    .filter-bar {
        display: flex;
        align-items: center;
        gap: 1rem;
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
    }
    .filter-label {
        color: #888;
        font-size: 0.85rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .filter-tabs {
        display: flex;
        gap: 0.4rem;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 50px;
        padding: 0.25rem;
    }
    .filter-tab {
        background: transparent;
        border: none;
        color: #aaa;
        padding: 0.35rem 1rem;
        border-radius: 50px;
        font-size: 0.85rem;
        cursor: pointer;
        transition: background 0.2s, color 0.2s;
        font-weight: 500;
    }
    .filter-tab:hover { color: white; }
    .filter-tab.active {
        background: var(--color-primary);
        color: white;
        font-weight: bold;
    }

    /* Leaderboard grid */
    .lb-container {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        overflow: hidden;
    }

    /* Each row is a 5-column grid on desktop */
    .lb-row {
        display: grid;
        grid-template-columns: 48px 1fr 60px 64px 64px;
        align-items: center;
        padding: clamp(0.6rem, 2vw, 0.9rem) clamp(0.75rem, 2.5vw, 1rem);
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
        font-size: clamp(1rem, 3.5vw, 1.2rem);
    }
    .rank-num {
        font-size: clamp(0.8rem, 2.5vw, 1rem);
        color: #888;
    }
    .col-name {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
        min-width: 0;
        padding-right: 0.5rem;
    }
    .username {
        font-size: clamp(0.82rem, 2.5vw, 0.95rem);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .top-3 .username { color: var(--color-accent); }
    .paid-badge {
        margin-left: 0.3rem;
        font-size: 0.8em;
        opacity: 0.85;
    }
    .mobile-stats {
        display: none; /* shown only on mobile */
        font-size: clamp(0.65rem, 1.8vw, 0.72rem);
        color: #666;
    }
    .col-pts {
        font-size: clamp(1rem, 3vw, 1.2rem);
        font-weight: 800;
        color: var(--color-primary);
        text-align: center;
    }
    .col-results, .col-goals {
        text-align: center;
        font-size: clamp(0.85rem, 2.5vw, 1rem);
        color: #aaa;
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
    .sync-banner-item .label { color: #888; }
    .sync-banner-item .value { color: white; font-weight: 600; }
    .sync-banner-item .value.countdown {
        font-family: monospace;
        color: var(--color-accent);
    }

    /* Mobile: collapse to 3 columns, show sub-line stats */
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
</style>
