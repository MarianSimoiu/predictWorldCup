<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { fetchWCMatches } from '../lib/api.js';
    import { syncMatchesToDb, recalculateAllScores } from '../lib/db.js';
    import { mockMatches } from '../lib/mockData.js';

    let apiKey = $state('');
    let statusMsg = $state('');
    let isSyncing = $state(false);

    // Hardcode your admin email here to protect the view
    const ADMIN_EMAIL = 'simoiumarian69@gmail.com';

    async function handleSync() {
        if (!apiKey) {
            statusMsg = "Please enter the football-data.org API key.";
            return;
        }
        
        isSyncing = true;
        statusMsg = "Fetching data from API...";
        try {
            const matches = await fetchWCMatches(apiKey);
            statusMsg = `Fetched ${matches.length} matches. Syncing to Firestore...`;
            await syncMatchesToDb(matches);
            statusMsg = "Sync complete! All matches updated in Firestore.";
        } catch (err) {
            statusMsg = `Error: ${err.message}`;
        }
        isSyncing = false;
    }

    async function handleRecalculate() {
        isSyncing = true;
        statusMsg = "Recalculating scores...";
        try {
            await recalculateAllScores();
            statusMsg = "Scores recalculation complete!";
        } catch (err) {
            statusMsg = `Error: ${err.message}`;
        }
        isSyncing = false;
    }

    async function handleMockSync() {
        isSyncing = true;
        statusMsg = "Syncing pre-packaged mock/demo matches...";
        try {
            await syncMatchesToDb(mockMatches);
            statusMsg = "Mock sync complete! All demo matches are now loaded in Firestore.";
        } catch (err) {
            statusMsg = `Error: ${err.message}`;
        }
        isSyncing = false;
    }
</script>

<div class="admin-panel">
    <h1>Admin Panel</h1>
    
    <div class="card">
        <h2>Sync Match Data</h2>
        <p>Pull the latest World Cup 2026 matches and results from football-data.org and save them to Firestore.</p>
        
        <div class="form-group">
            <label for="api-key">Football-Data.org API Key</label>
            <input type="password" id="api-key" bind:value={apiKey} placeholder="Enter your API token" />
        </div>
        
        
        <div class="actions">
            <button onclick={handleSync} disabled={isSyncing} class="sync-btn">
                {isSyncing ? 'Processing...' : 'Sync Matches'}
            </button>
            <button onclick={handleMockSync} disabled={isSyncing} class="mock-btn">
                Sync Mock/Demo Data
            </button>
            <button onclick={handleRecalculate} disabled={isSyncing} class="recalc-btn">
                Recalculate Scores
            </button>
        </div>
        
        {#if statusMsg}
            <div class="status {statusMsg.includes('Error') ? 'error' : 'success'}">
                {statusMsg}
            </div>
        {/if}
    </div>
</div>

<style>
    .admin-panel {
        padding: clamp(1rem, 3vw, 2rem);
        max-width: 800px;
        margin: 0 auto;
        width: 100%;
    }
    .card {
        background: rgba(255, 255, 255, 0.05);
        padding: clamp(1.5rem, 4vw, 2rem);
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
    }
    h1 { 
        color: var(--color-danger);
        margin-left: 0;
        margin-right: 0;
    }
    h2 { 
        color: var(--color-primary); 
        margin-top: 0;
        font-size: clamp(1.1rem, 4vw, 1.5rem);
    }
    p {
        font-size: clamp(0.9rem, 2vw, 1rem);
        line-height: 1.5;
    }
    
    .form-group {
        margin: clamp(1rem, 3vw, 1.5rem) 0;
    }
    label {
        display: block;
        margin-bottom: 0.5rem;
        font-size: clamp(0.85rem, 2vw, 1rem);
    }
    input {
        width: 100%;
        padding: clamp(0.5rem, 2vw, 0.75rem);
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.2);
        background: rgba(0, 0, 0, 0.2);
        color: white;
        font-size: clamp(0.9rem, 2vw, 1rem);
        box-sizing: border-box;
    }
    
    .actions {
        display: flex;
        gap: clamp(0.5rem, 2vw, 1rem);
        flex-wrap: wrap;
        margin: clamp(1.5rem, 3vw, 2rem) 0;
    }
    
    .sync-btn, .recalc-btn, .mock-btn {
        border: none;
        padding: clamp(0.5rem, 2vw, 0.75rem) clamp(1rem, 3vw, 1.5rem);
        border-radius: 6px;
        font-weight: bold;
        cursor: pointer;
        transition: transform 0.2s, opacity 0.2s;
        font-size: clamp(0.8rem, 2vw, 0.95rem);
        flex: 1;
        min-width: 120px;
    }
    .sync-btn {
        background: var(--color-danger);
        color: white;
    }
    .mock-btn {
        background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
        color: white;
    }
    .recalc-btn {
        background: var(--color-accent);
        color: var(--color-bg);
    }
    .sync-btn:disabled, .recalc-btn:disabled, .mock-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    
    .status {
        margin-top: clamp(1rem, 3vw, 1.5rem);
        padding: clamp(0.75rem, 2vw, 1rem);
        border-radius: 6px;
        font-size: clamp(0.85rem, 2vw, 1rem);
    }
    .status.success {
        background: rgba(16, 185, 129, 0.2);
        color: var(--color-success);
    }
    .status.error {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-danger);
    }

    @media (max-width: 640px) {
        .actions {
            flex-direction: column;
        }
        .sync-btn, .recalc-btn, .mock-btn {
            width: 100%;
            min-width: unset;
        }
    }
</style>
