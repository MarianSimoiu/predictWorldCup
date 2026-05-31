<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { doc, onSnapshot, query, collection, orderBy } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let userStats = $state({ totalPoints: 0, correctPredictions: 0, rank: '-' });
    let error = $state(null);

    $effect(() => {
        if (!userStore.user) return;

        // Listen to user stats
        const unsubUser = onSnapshot(doc(db, 'users', userStore.user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                userStats.totalPoints = data.totalPoints || 0;
                userStats.correctPredictions = data.correctPredictions || 0;
            }
            error = null;
        }, (err) => {
            console.error("Dashboard stats error:", err);
            error = err.message || String(err);
        });

        // Listen to leaderboard to find rank
        const q = query(collection(db, 'users'), orderBy('totalPoints', 'desc'));
        const unsubLeaderboard = onSnapshot(q, (snapshot) => {
            let rank = 1;
            let found = false;
            snapshot.forEach((doc) => {
                if (doc.id === userStore.user.uid) {
                    userStats.rank = rank;
                    found = true;
                }
                rank++;
            });
            if (!found) userStats.rank = '-';
            error = null;
        }, (err) => {
            console.error("Dashboard leaderboard rank error:", err);
            error = err.message || String(err);
        });

        return () => {
            unsubUser();
            unsubLeaderboard();
        };
    });
</script>

<div class="dashboard">
    <h1>Dashboard</h1>
    <p>Welcome, {userStore.user?.displayName || userStore.user?.email}!</p>
    
    {#if error}
        <ErrorMessage error={error} context="Dashboard" />
    {/if}
    
    <div class="stats-grid">
        <div class="stat-card">
            <h3>Total Points</h3>
            <div class="value">{userStats.totalPoints}</div>
        </div>
        <div class="stat-card">
            <h3>Rank</h3>
            <div class="value">{userStats.rank}</div>
        </div>
        <div class="stat-card">
            <h3>Exact Results</h3>
            <div class="value">{userStats.correctPredictions}</div>
        </div>
    </div>
</div>

<style>
    .dashboard {
        padding: 2rem;
    }
    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
    }
    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
    }
    .stat-card h3 {
        margin: 0;
        color: #888;
        font-size: 1rem;
    }
    .value {
        font-size: 2.5rem;
        font-weight: bold;
        color: var(--color-primary);
        margin-top: 0.5rem;
    }
</style>
