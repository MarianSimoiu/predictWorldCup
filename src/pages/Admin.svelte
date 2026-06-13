<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { fetchWCMatches } from '../lib/api.js';
    import { syncMatchesToDb, recalculateAllScores } from '../lib/db.js';
    import { mockMatches } from '../lib/mockData.js';
    import { push } from 'svelte-spa-router';
    import { db } from '../lib/firebase.js';
    import { collection, query, orderBy, getDocs, doc, updateDoc, onSnapshot } from 'firebase/firestore';

    let apiKey = $state('');
    let statusMsg = $state('');
    let isSyncing = $state(false);

    let allUsers = $state([]);
    let isLoadingUsers = $state(false);
    let usersError = $state(null);

    let lastSyncStatus = $state(null);
    let lastSyncTime = $state(null);
    let syncError = $state(null);
    let syncedMatchesCount = $state(null);

    // Hardcode your admin email here to protect the view
    const ADMIN_EMAIL = 'simoiumarian69@gmail.com';

    $effect(() => {
        if (!userStore.loading) {
            if (!userStore.user || userStore.user.email !== ADMIN_EMAIL) {
                push('/dashboard');
            } else {
                loadUsers();
            }
        }
    });

    $effect(() => {
        if (!userStore.loading && userStore.user && userStore.user.email === ADMIN_EMAIL) {
            const unsubscribe = onSnapshot(doc(db, 'system', 'status'), (docSnap) => {
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    lastSyncStatus = data.status || null;
                    lastSyncTime = data.lastSync ? data.lastSync.toDate() : null;
                    syncError = data.error || null;
                    syncedMatchesCount = data.matchesSyncedCount || null;
                }
            }, (err) => {
                console.error("Error subscribing to system status:", err);
            });
            return unsubscribe;
        }
    });

    async function loadUsers() {
        isLoadingUsers = true;
        usersError = '';
        try {
            const q = query(collection(db, 'users'), orderBy('totalPoints', 'desc'));
            const snap = await getDocs(q);
            const list = [];
            snap.forEach(docSnap => {
                const data = docSnap.data();
                list.push({
                    id: docSnap.id,
                    ...data,
                    editDisplayName: data.displayName || '',
                    editEmail: data.email || '',
                    isSaving: false
                });
            });
            allUsers = list;
        } catch (err) {
            console.error("Error loading users:", err);
            usersError = `Error loading users: ${err.message}`;
        }
        isLoadingUsers = false;
    }

    async function handleUpdateUser(usr) {
        usr.isSaving = true;
        try {
            const docRef = doc(db, 'users', usr.id);
            await updateDoc(docRef, {
                displayName: usr.editDisplayName || null,
                email: usr.editEmail || null,
                lastUpdated: new Date()
            });
            usr.displayName = usr.editDisplayName;
            usr.email = usr.editEmail;
            statusMsg = `Updated profile for user ID ${usr.id.substring(0, 8)}`;
        } catch (err) {
            statusMsg = `Error updating user ${usr.id.substring(0, 8)}: ${err.message}`;
        }
        usr.isSaving = false;
    }

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

        {#if lastSyncTime}
            <div class="automation-status {lastSyncStatus}">
                <div class="status-header">
                    <span class="status-indicator">●</span>
                    <h3>Background Automation Status: {lastSyncStatus === 'success' ? 'Active' : 'Error'}</h3>
                </div>
                <div class="status-details">
                    <p><strong>Last Sync:</strong> {lastSyncTime.toLocaleString()}</p>
                    {#if lastSyncStatus === 'success'}
                        <p><strong>Matches Synced:</strong> {syncedMatchesCount ?? 'N/A'}</p>
                    {:else if syncError}
                        <p class="error-msg"><strong>Error Details:</strong> {syncError}</p>
                    {/if}
                    <p class="helper-text">Runs automatically in the background every hour via GitHub Actions.</p>
                </div>
            </div>
        {/if}
    </div>

    <div class="card user-management-card">
        <h2>Manage Predictor Profiles</h2>
        <p>Assign names and emails to predictors who registered with fallback/placeholder accounts. These names will be instantly used on the leaderboard.</p>
        
        {#if isLoadingUsers}
            <div class="loading">Loading predictors...</div>
        {:else if usersError}
            <div class="status error">{usersError}</div>
        {:else}
            <div class="users-list">
                {#each allUsers as usr (usr.id)}
                    <div class="user-row">
                        <div class="user-info">
                            <span class="uid">ID: {usr.id.substring(0, 8)}...</span>
                            <span class="stats">Points: {usr.totalPoints || 0} | Correct: {usr.correctPredictions || 0}</span>
                        </div>
                        <div class="user-inputs">
                            <input 
                                type="text" 
                                placeholder="Display Name" 
                                bind:value={usr.editDisplayName} 
                            />
                            <input 
                                type="email" 
                                placeholder="Email" 
                                bind:value={usr.editEmail} 
                            />
                            <button 
                                onclick={() => handleUpdateUser(usr)} 
                                disabled={usr.isSaving}
                            >
                                {usr.isSaving ? 'Saving...' : 'Save'}
                            </button>
                        </div>
                    </div>
                {/each}
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

    .user-management-card {
        margin-top: 2rem;
    }
    .users-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
        margin-top: 1.5rem;
    }
    .user-row {
        background: rgba(0, 0, 0, 0.2);
        padding: 1rem;
        border-radius: 8px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        gap: 1rem;
        flex-wrap: wrap;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }
    .user-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .user-info .uid {
        font-family: monospace;
        color: #888;
        font-size: 0.85rem;
    }
    .user-info .stats {
        font-size: 0.9rem;
        color: var(--color-primary);
    }
    .user-inputs {
        display: flex;
        gap: 0.5rem;
        align-items: center;
        flex-wrap: wrap;
    }
    .user-inputs input {
        width: clamp(120px, 20vw, 160px);
        padding: 0.4rem 0.6rem;
        font-size: 0.85rem;
    }
    .user-inputs button {
        background: var(--color-primary);
        color: var(--color-bg);
        border: none;
        padding: 0.4rem 1rem;
        border-radius: 4px;
        font-weight: bold;
        cursor: pointer;
        font-size: 0.85rem;
        transition: opacity 0.2s;
    }
    .user-inputs button:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    .loading {
        color: #888;
        font-style: italic;
        margin-top: 1rem;
    }

    @media (max-width: 640px) {
        .actions {
            flex-direction: column;
        }
        .sync-btn, .recalc-btn, .mock-btn {
            width: 100%;
            min-width: unset;
        }
        .user-row {
            flex-direction: column;
            align-items: stretch;
        }
        .user-inputs {
            width: 100%;
        }
        .user-inputs input {
            flex: 1;
            width: unset;
        }
    }

    .automation-status {
        margin-top: 1.5rem;
        padding: 1rem;
        border-radius: 8px;
        background: rgba(0, 0, 0, 0.25);
        border-left: 4px solid #888;
        text-align: left;
    }
    .automation-status.success {
        border-left-color: var(--color-success, #10b981);
    }
    .automation-status.success .status-indicator {
        color: var(--color-success, #10b981);
        animation: pulse 2s infinite;
    }
    .automation-status.failed {
        border-left-color: var(--color-danger, #ef4444);
    }
    .automation-status.failed .status-indicator {
        color: var(--color-danger, #ef4444);
    }
    .status-header {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        margin-bottom: 0.75rem;
    }
    .status-header h3 {
        margin: 0;
        font-size: 1rem;
        color: white;
    }
    .status-details {
        font-size: 0.85rem;
        color: #ccc;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
    }
    .status-details p {
        margin: 0;
        font-size: 0.85rem;
        line-height: 1.4;
    }
    .error-msg {
        color: var(--color-danger, #ef4444);
    }
    .helper-text {
        color: #888;
        font-style: italic;
        margin-top: 0.25rem !important;
    }
    @keyframes pulse {
        0% { opacity: 0.6; }
        50% { opacity: 1; }
        100% { opacity: 0.6; }
    }
</style>
