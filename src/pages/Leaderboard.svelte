<script>
    import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let leaderboard = $state([]);
    let loading = $state(true);
    let error = $state(null);

    $effect(() => {
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

    {#if error}
        <ErrorMessage error={error} context="Leaderboard" />
    {:else if loading}
        <div class="loading">Loading rankings...</div>
    {:else}
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th class="rank">#</th>
                        <th class="name">Predictor</th>
                        <th class="score">Points</th>
                        <th class="correct">
                            Exact Results
                            <span class="tooltip-icon" data-tooltip="Correct predictions of the match outcome (Win/Draw/Loss)">ℹ️</span>
                        </th>
                        <th class="goals-correct">
                            Goals Predictions
                            <span class="tooltip-icon" data-tooltip="Correct predictions of the total goals tier (0-1, 2-3, or 4+ goals)">ℹ️</span>
                        </th>
                    </tr>
                </thead>
                <tbody>
                    {#each leaderboard as user (user.id)}
                        <tr class:top-3={user.rank <= 3}>
                            <td class="rank">
                                {#if user.rank === 1}🥇
                                {:else if user.rank === 2}🥈
                                {:else if user.rank === 3}🥉
                                {:else}{user.rank}{/if}
                            </td>
                            <td class="name">{user.displayName || user.email?.split('@')[0] || `User_${user.id.substring(0, 5)}`}</td>
                            <td class="score">{user.totalPoints || 0}</td>
                            <td class="correct">{user.correctPredictions || 0}</td>
                            <td class="goals-correct">{user.correctGoals || 0}</td>
                        </tr>
                    {/each}
                </tbody>
            </table>
        </div>
    {/if}
</div>

<style>
    .leaderboard-page {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
    }
    h1 {
        text-align: center;
        color: var(--color-accent);
        margin-bottom: 2rem;
        font-size: 2.5rem;
    }
    .table-container {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        overflow: hidden;
    }
    table {
        width: 100%;
        border-collapse: collapse;
        text-align: left;
    }
    th, td {
        padding: 1rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    th {
        background: rgba(0, 0, 0, 0.2);
        color: #aaa;
        font-weight: 600;
        text-transform: uppercase;
        font-size: 0.85rem;
        letter-spacing: 1px;
    }
    tr:hover {
        background: rgba(255, 255, 255, 0.02);
    }
    tr.top-3 {
        background: linear-gradient(90deg, rgba(251, 191, 36, 0.1) 0%, transparent 100%);
    }
    tr.top-3 td.name {
        font-weight: bold;
        color: var(--color-accent);
    }
    .rank { width: 60px; text-align: center; font-size: 1.2rem; }
    .score { font-size: 1.25rem; font-weight: bold; color: var(--color-primary); }
    .correct, .goals-correct { text-align: center; color: #aaa; }

    .tooltip-icon {
        cursor: help;
        display: inline-block;
        margin-left: 6px;
        position: relative;
        font-size: 0.9em;
    }

    .tooltip-icon::after {
        content: attr(data-tooltip);
        position: absolute;
        bottom: 150%;
        left: 50%;
        transform: translateX(-50%);
        background-color: #222;
        color: #fff;
        padding: 8px 12px;
        border-radius: 6px;
        font-size: 0.75rem;
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

    .tooltip-icon:hover::after {
        opacity: 1;
        visibility: visible;
    }

    @media (max-width: 640px) {
        .leaderboard-page {
            padding: 1rem;
        }
        .table-container {
            overflow-x: auto;
            border-radius: 8px;
        }
        table {
            min-width: 500px; /* Forces scrolling instead of squishing text unreadably */
        }
        th, td {
            padding: 0.75rem 0.5rem;
        }
        th {
            font-size: 0.75rem;
        }
        .rank {
            width: 40px;
            font-size: 1rem;
        }
        .score {
            font-size: 1.1rem;
        }
    }
</style>
