<script>
    import Router from 'svelte-spa-router';
    import { userStore, predictionStore } from './lib/stores.svelte.js';
    import { auth } from './lib/firebase.js';
    import { onAuthStateChanged } from 'firebase/auth';
    import { listenToMatches, listenToUserPredictions } from './lib/db.js';
    
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

    // Route definition
    const routes = {
        '/': Login,
        '/dashboard': Dashboard,
        '/admin': Admin,
        '/groups': Groups,
        '/group/:id': GroupDetail,
        '/match/:id': MatchDetail,
        '/leaderboard': Leaderboard,
        '/winner': WinnerPrediction,
        '/knockout': Knockout,
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
        <Router {routes} />
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
