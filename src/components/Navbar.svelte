<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { auth } from '../lib/firebase.js';
    import { signOut } from 'firebase/auth';
    import { push } from 'svelte-spa-router';

    async function handleLogout() {
        await signOut(auth);
        push('/');
    }
</script>

<nav class="navbar">
    <div class="logo">⚽ Predict26</div>
    <div class="links">
        {#if userStore.user}
            <a href="#/dashboard">Dashboard</a>
            <a href="#/groups">Groups</a>
            <a href="#/knockout">Knockouts</a>
            <a href="#/winner">Champion</a>
            <a href="#/leaderboard">Leaderboard</a>
            {#if userStore.user.email === 'simoiumarian69@gmail.com'}
                <a href="#/admin" class="admin-link">Admin</a>
            {/if}
            <button onclick={handleLogout} class="logout-btn">Logout</button>
        {/if}
    </div>
</nav>

<style>
    .navbar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 1rem 2rem;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }
    .logo {
        font-weight: bold;
        font-size: 1.5rem;
        color: var(--color-primary);
    }
    .links {
        display: flex;
        gap: 1.5rem;
        align-items: center;
    }
    a {
        color: white;
        text-decoration: none;
        transition: color 0.2s;
    }
    a:hover {
        color: var(--color-primary);
    }
    .admin-link {
        color: var(--color-danger);
    }
    .admin-link:hover {
        color: #ff7777;
    }
    .logout-btn {
        background: transparent;
        border: 1px solid var(--color-primary);
        color: var(--color-primary);
        padding: 0.5rem 1rem;
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
    }
    .logout-btn:hover {
        background: var(--color-primary);
        color: white;
    }
</style>
