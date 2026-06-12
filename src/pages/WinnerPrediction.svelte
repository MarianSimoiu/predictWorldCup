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
        bottom: clamp(1rem, 3vw, 2rem);
        left: clamp(0.5rem, 2vw, 1rem);
        right: clamp(0.5rem, 2vw, 1rem);
        background: rgba(15, 23, 42, 0.9);
        backdrop-filter: blur(10px);
        border: 1px solid var(--color-accent);
        padding: clamp(0.75rem, 2vw, 1rem) clamp(1rem, 3vw, 2rem);
        border-radius: 50px;
        display: flex;
        align-items: center;
        gap: clamp(1rem, 3vw, 2rem);
        box-shadow: 0 10px 25px rgba(0,0,0,0.5);
        flex-wrap: wrap;
        justify-content: center;
        max-width: calc(100vw - 2rem);
        left: 50%;
        transform: translateX(-50%);
    }
    .pick-text {
        font-size: clamp(0.85rem, 2vw, 1rem);
        white-space: nowrap;
    }
    .save-bar button {
        background: var(--color-accent);
        color: var(--color-bg);
        border: none;
        padding: clamp(0.4rem, 1vw, 0.5rem) clamp(1rem, 3vw, 1.5rem);
        border-radius: 20px;
        font-weight: bold;
        cursor: pointer;
        font-size: clamp(0.8rem, 2vw, 0.95rem);
        white-space: nowrap;
    }
    .msg {
        text-align: center;
        margin-top: clamp(1rem, 3vw, 2rem);
        font-size: clamp(0.85rem, 2vw, 1rem);
        padding-bottom: clamp(4rem, 8vw, 6rem);
    }
    .msg.success { color: var(--color-success); }
    .msg.error { color: var(--color-danger); }

    @media (max-width: 768px) {
        .save-bar {
            position: fixed;
            bottom: clamp(0.75rem, 2vw, 1.5rem);
            left: 0.5rem;
            right: 0.5rem;
            width: auto;
            gap: 1rem;
        }
        .pick-text {
            flex: 0 1 100%;
            text-align: center;
        }
    }

    @media (max-width: 480px) {
        .teams-grid {
            grid-template-columns: repeat(auto-fill, minmax(100px, 1fr));
        }
        .save-bar {
            flex-direction: column;
            gap: 0.75rem;
        }
        .pick-text {
            font-size: 0.85rem;
        }
    }
</style>
