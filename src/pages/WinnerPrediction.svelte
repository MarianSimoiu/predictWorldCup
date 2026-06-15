<script>
    import { matchStore, userStore } from '../lib/stores.svelte.js';
    import { saveWinnerPrediction } from '../lib/db.js';
    import { doc, getDoc } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';

    let selectedTeam = $state(null);
    let isSaving = $state(false);
    let saveMsg = $state('');

    // Extract unique teams from matches
    let teams = $derived.by(() => {
        const unique = new Map();
        for (const match of matchStore.matches) {
            if (match.team1 && match.team1.name !== 'TBD') {
                unique.set(match.team1.name, match.team1.crest);
            }
            if (match.team2 && match.team2.name !== 'TBD') {
                unique.set(match.team2.name, match.team2.crest);
            }
        }
        return Array.from(unique.entries()).map(([name, crest]) => ({ name, crest })).sort((a, b) => a.name.localeCompare(b.name));
    });

    let isLocked = $derived.by(() => {
        // Find the last group stage match
        const groupMatches = matchStore.matches.filter(m => m.stage === 'GROUP_STAGE');
        if (groupMatches.length === 0) return false;
        
        const lastMatch = groupMatches.reduce((latest, current) => {
            return current.kickoff > latest.kickoff ? current : latest;
        }, groupMatches[0]);

        return new Date() >= lastMatch.kickoff;
    });

    $effect(() => {
        if (userStore.user) {
            getDoc(doc(db, 'users', userStore.user.uid)).then(snap => {
                if (snap.exists() && snap.data().winnerPrediction) {
                    selectedTeam = snap.data().winnerPrediction;
                }
            });
        }
    });

    async function handleSave() {
        if (!selectedTeam) return;
        isSaving = true;
        saveMsg = '';
        try {
            await saveWinnerPrediction(userStore.user.uid, selectedTeam);
            saveMsg = "Winner prediction saved! 🏆";
        } catch (err) {
            saveMsg = `Error: ${err.message}`;
        }
        isSaving = false;
    }
</script>

<div class="winner-page">
    <h1>Predict the Champion</h1>
    <p class="subtitle">Pick who will lift the trophy! Worth 10 bonus points.</p>
    
    {#if isLocked}
        <div class="locked-banner">
            LOCKED 🔒 The group stage has ended. Winner predictions can no longer be changed.
            {#if selectedTeam}
                <br>Your pick: <strong>{selectedTeam}</strong>
            {/if}
        </div>
    {:else}
        <div class="teams-grid">
            {#each teams as team}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div 
                    class="team-card {selectedTeam === team.name ? 'selected' : ''}"
                    onclick={() => selectedTeam = team.name}>
                    {#if team.crest}
                        <img src={team.crest} alt="{team.name} flag" />
                    {/if}
                    <span>{team.name}</span>
                </div>
            {/each}
        </div>

        {#if selectedTeam}
            <div class="save-bar">
                <span class="pick-text">Your pick: <strong>{selectedTeam}</strong></span>
                <button onclick={handleSave} disabled={isSaving}>
                    {isSaving ? 'Saving...' : 'Lock it in!'}
                </button>
            </div>
            {#if saveMsg}
                <div class="msg {saveMsg.includes('Error') ? 'error' : 'success'}">
                    {saveMsg}
                </div>
            {/if}
        {/if}
    {/if}
</div>

<style>
    .winner-page {
        padding: clamp(1rem, 3vw, 2rem);
        max-width: 1000px;
        margin: 0 auto;
        width: 100%;
    }
    h1 {
        text-align: center;
        color: var(--color-accent);
        margin-bottom: 0.5rem;
        font-size: clamp(1.5rem, 5vw, 2.5rem);
    }
    .subtitle {
        text-align: center;
        color: #aaa;
        margin-bottom: clamp(1rem, 3vw, 2rem);
        font-size: clamp(0.9rem, 2vw, 1rem);
    }
    .locked-banner {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-danger);
        padding: clamp(1rem, 3vw, 1.5rem);
        border-radius: 12px;
        text-align: center;
        font-size: clamp(0.95rem, 2vw, 1.2rem);
        line-height: 1.5;
    }
    .teams-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(clamp(120px, 25vw, 150px), 1fr));
        gap: clamp(0.75rem, 2vw, 1rem);
        margin-bottom: clamp(3rem, 8vw, 5rem);
    }
    .team-card {
        background: rgba(255, 255, 255, 0.05);
        border: 2px solid transparent;
        border-radius: 12px;
        padding: clamp(0.75rem, 2vw, 1rem);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.5rem;
        cursor: pointer;
        transition: all 0.2s;
    }
    .team-card:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateY(-2px);
    }
    .team-card.selected {
        background: rgba(251, 191, 36, 0.1);
        border-color: var(--color-accent);
        box-shadow: 0 0 15px rgba(251, 191, 36, 0.3);
    }
    .team-card img {
        width: clamp(50px, 12vw, 60px);
        height: clamp(33px, 8vw, 40px);
        object-fit: cover;
        border-radius: 4px;
    }
    .team-card span {
        text-align: center;
        font-size: clamp(0.8rem, 2vw, 0.9rem);
        font-weight: bold;
        word-break: break-word;
    }
    .save-bar {
        position: fixed;
        bottom: 1.5rem;
        left: 50%;
        transform: translateX(-50%);
        width: calc(100% - 2rem);
        max-width: 600px;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.95);
        backdrop-filter: blur(10px);
        border: 1px solid var(--color-accent);
        padding: 0.75rem 1.5rem;
        border-radius: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    }
    .pick-text {
        font-size: clamp(0.85rem, 2vw, 1rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex: 1;
        min-width: 0;
    }
    .save-bar button {
        background: var(--color-accent);
        color: var(--color-bg);
        border: none;
        padding: 0.5rem 1.5rem;
        border-radius: 20px;
        font-weight: bold;
        cursor: pointer;
        font-size: 0.9rem;
        white-space: nowrap;
        flex-shrink: 0;
        transition: opacity 0.2s;
    }
    .save-bar button:hover:not(:disabled) {
        opacity: 0.85;
    }
    .save-bar button:disabled {
        opacity: 0.6;
        cursor: not-allowed;
    }
    .msg {
        text-align: center;
        margin-top: clamp(1rem, 3vw, 2rem);
        font-size: clamp(0.85rem, 2vw, 1rem);
        padding-bottom: clamp(4rem, 8vw, 6rem);
    }
    .msg.success { color: var(--color-success); }
    .msg.error { color: var(--color-danger); }

    @media (max-width: 480px) {
        .teams-grid {
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        }
        .save-bar {
            bottom: 1rem;
            border-radius: 16px;
            flex-direction: column;
            align-items: stretch;
            padding: 1rem;
            gap: 0.6rem;
        }
        .pick-text {
            white-space: normal;
            text-align: center;
            flex: none;
        }
        .save-bar button {
            width: 100%;
            padding: 0.65rem 1rem;
            border-radius: 10px;
            font-size: 1rem;
        }
    }
</style>
