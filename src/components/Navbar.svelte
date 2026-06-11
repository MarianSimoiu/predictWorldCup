<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { auth } from '../lib/firebase.js';
    import { signOut } from 'firebase/auth';
    import { push } from 'svelte-spa-router';

    let menuOpen = $state(false);

    async function handleLogout() {
        await signOut(auth);
        push('/');
    }

    function toggleMenu() {
        menuOpen = !menuOpen;
    }

    function closeMenu() {
        menuOpen = false;
    }
</script>

<nav class="navbar">
    <div class="navbar-container">
        <div class="logo">⚽ Predict26</div>
        <button class="hamburger" onclick={toggleMenu} aria-label="Toggle menu" aria-expanded={menuOpen}>
            <span></span>
            <span></span>
            <span></span>
        </button>
        <div class="links" class:open={menuOpen}>
            {#if userStore.user}
                <a href="#/dashboard" on:click={closeMenu}>Dashboard</a>
                <a href="#/groups" on:click={closeMenu}>Groups</a>
                <a href="#/knockout" on:click={closeMenu}>Knockouts</a>
                <a href="#/winner" on:click={closeMenu}>Champion</a>
                <a href="#/leaderboard" on:click={closeMenu}>Leaderboard</a>
                {#if userStore.user.email === 'simoiumarian69@gmail.com'}
                    <a href="#/admin" class="admin-link" on:click={closeMenu}>Admin</a>
                {/if}
                <button onclick={handleLogout} class="logout-btn">Logout</button>
            {/if}
        </div>
    </div>
</nav>

<style>
    .navbar {
        position: sticky;
        top: 0;
        z-index: 1000;
        background: rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(10px);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    }

    .navbar-container {
        max-width: 1200px;
        margin: 0 auto;
        padding: 1rem;
        display: flex;
        justify-content: space-between;
        align-items: center;
    }

    .logo {
        font-weight: bold;
        font-size: clamp(1.2rem, 4vw, 1.5rem);
        color: var(--color-primary);
        white-space: nowrap;
    }

    .links {
        display: flex;
        gap: 1.5rem;
        align-items: center;
    }

    .hamburger {
        display: none;
        flex-direction: column;
        background: none;
        border: none;
        cursor: pointer;
        padding: 0.5rem;
        gap: 0.4rem;
    }

    .hamburger span {
        width: 25px;
        height: 3px;
        background: var(--color-text);
        border-radius: 2px;
        transition: all 0.3s ease;
    }

    a {
        color: white;
        text-decoration: none;
        transition: color 0.2s;
        font-size: clamp(0.9rem, 2vw, 1rem);
        white-space: nowrap;
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
        font-size: clamp(0.85rem, 2vw, 1rem);
        white-space: nowrap;
    }

    .logout-btn:hover {
        background: var(--color-primary);
        color: white;
    }

    @media (max-width: 768px) {
        .hamburger {
            display: flex;
        }

        .navbar-container {
            padding: 0.75rem;
        }

        .links {
            position: absolute;
            top: 100%;
            left: 0;
            right: 0;
            background: rgba(15, 23, 42, 0.98);
            backdrop-filter: blur(10px);
            flex-direction: column;
            gap: 1rem;
            padding: 1.5rem;
            border-bottom: 1px solid rgba(255, 255, 255, 0.1);
            max-height: 0;
            overflow: hidden;
            transition: max-height 0.3s ease;
        }

        .links.open {
            max-height: 400px;
        }

        a, .logout-btn {
            width: 100%;
            text-align: center;
        }

        .logout-btn {
            padding: 0.75rem;
        }
    }

    @media (max-width: 480px) {
        .logo {
            font-size: 1.1rem;
        }

        .links {
            padding: 1rem;
        }
    }
</style>
