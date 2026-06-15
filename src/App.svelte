<script>
    import Router, { push } from 'svelte-spa-router';
    import { wrap } from 'svelte-spa-router/wrap';
    import { userStore, predictionStore } from './lib/stores.svelte.js';
    import { auth } from './lib/firebase.js';
    import { onAuthStateChanged } from 'firebase/auth';
    import { listenToMatches, listenToUserPredictions, ensureUserProfile } from './lib/db.js';

    import Navbar from './components/Navbar.svelte';
    import Login from './pages/Login.svelte';
    import Dashboard from './pages/Dashboard.svelte';
    import Admin from './pages/Admin.svelte';
    import Groups from './pages/Groups.svelte';
    import GroupDetail from './pages/GroupDetail.svelte';
    import MatchDetail from './pages/MatchDetail.svelte';
    import Leaderboard from './pages/Leaderboard.svelte';
    import WinnerPrediction from './pages/WinnerPrediction.svelte';
    import Knockout from './pages/Knockout.svelte';

    function requireAuth() {
        return !!userStore.user;
    }

    // Route definition — all routes except login are wrapped with an auth guard.
    // The Router only renders after userStore.loading is false, so auth state is
    // resolved before any condition is evaluated.
    const routes = {
        '/': Login,
        '/dashboard': wrap({ component: Dashboard, conditions: [requireAuth] }),
        '/admin': wrap({ component: Admin, conditions: [requireAuth] }),
        '/groups': wrap({ component: Groups, conditions: [requireAuth] }),
        '/group/:id': wrap({ component: GroupDetail, conditions: [requireAuth] }),
        '/match/:id': wrap({ component: MatchDetail, conditions: [requireAuth] }),
        '/leaderboard': wrap({ component: Leaderboard, conditions: [requireAuth] }),
        '/winner': wrap({ component: WinnerPrediction, conditions: [requireAuth] }),
        '/knockout': wrap({ component: Knockout, conditions: [requireAuth] }),
    };

    $effect(() => {
        let unsubscribeMatches;
        let unsubscribePredictions;
        const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
            userStore.user = user;
            userStore.loading = false;
            
            if (user) {
                unsubscribeMatches = listenToMatches();
                unsubscribePredictions = listenToUserPredictions(user.uid);
                ensureUserProfile(user).catch(err => console.error("Error setting user profile in DB:", err));
            } else {
                if (unsubscribeMatches) unsubscribeMatches();
                if (unsubscribePredictions) unsubscribePredictions();
                predictionStore.predictions = {};
                predictionStore.loading = false;
            }
        });
        return () => {
            unsubscribeAuth();
            if (unsubscribeMatches) unsubscribeMatches();
            if (unsubscribePredictions) unsubscribePredictions();
        };
    });
</script>

{#if !userStore.loading}
    <Navbar />
    <main class="container">
        <Router {routes} on:conditionsFailed={() => push('/')} />
    </main>
{:else}
    <div class="loading-screen">
        <div class="spinner">⚽</div>
    </div>
{/if}

<style>
    .loading-screen {
        display: flex;
        justify-content: center;
        align-items: center;
        height: 100vh;
        font-size: 3rem;
    }
    .spinner {
        animation: spin 1s linear infinite;
    }
    @keyframes spin {
        100% { transform: rotate(360deg); }
    }
</style>
