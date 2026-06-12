<script>
    import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let leaderboard = $state([]);
    let loading = $state(true);
    let error = $state(null);

    $effect(() => {
        const q = query(collection(db, 'users'), orderBy('totalPoints', 'desc'));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const data = [];
            let rank = 1;
            snapshot.forEach((doc) => {
                const user = doc.data();
                data.push({ id: doc.id, rank, ...user });
                rank++;
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
                        <th class="correct">Exact Results</th>
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
    .correct { text-align: center; color: #aaa; }
</style>
