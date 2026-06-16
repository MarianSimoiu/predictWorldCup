<script>
    import { matchStore, userStore } from '../lib/stores.svelte.js';
    import { saveWinnerPrediction } from '../lib/db.js';
    import { doc, getDoc } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import { CHAMPION_LOCK_DEADLINE } from '../lib/config.js';

    let savedPrediction = $state(null);  // what is persisted in Firestore
    let selectedTeam = $state(null);      // what the user has highlighted in the grid
    let isSaving = $state(false);
    let saveMsg = $state('');

    let teams = $derived.by(() => {
        const unique = new Map();
        for (const match of matchStore.matches) {
            if (match.team1?.name && match.team1.name !== 'TBD') unique.set(match.team1.name, match.team1.crest);
            if (match.team2?.name && match.team2.name !== 'TBD') unique.set(match.team2.name, match.team2.crest);
        }
        return Array.from(unique.entries())
            .map(([name, crest]) => ({ name, crest }))
            .sort((a, b) => a.name.localeCompare(b.name));
    });

    let now = $state(new Date());
    $effect(() => {
        const t = setInterval(() => { now = new Date(); }, 1000);
        return () => clearInterval(t);
    });

    let isLocked = $derived(now >= CHAMPION_LOCK_DEADLINE);

    let countdown = $derived.by(() => {
        const diff = CHAMPION_LOCK_DEADLINE - now;
        if (diff <= 0) return null;
        return {
            days:    Math.floor(diff / 86400000),
            hours:   Math.floor((diff % 86400000) / 3600000),
            minutes: Math.floor((diff % 3600000)  / 60000),
            seconds: Math.floor((diff % 60000)    / 1000)
        };
    });

    // Derived bar state
    let hasChange = $derived(selectedTeam !== null && selectedTeam !== savedPrediction);
    let showBar = $derived(!isLocked && (selectedTeam !== null || savedPrediction !== null));

    $effect(() => {
        if (!userStore.user) return;
        getDoc(doc(db, 'users', userStore.user.uid)).then(snap => {
            if (snap.exists() && snap.data().winnerPrediction) {
                savedPrediction = snap.data().winnerPrediction;
                selectedTeam = snap.data().winnerPrediction;
            }
        });
    });

    async function handleSave() {
        if (!selectedTeam) return;
        isSaving = true;
        saveMsg = '';
        try {
            await saveWinnerPrediction(userStore.user.uid, selectedTeam);
            savedPrediction = selectedTeam;
            saveMsg = 'Champion prediction saved! 🏆';
        } catch (err) {
            saveMsg = `Error: ${err.message}`;
        }
        isSaving = false;
    }
</script>

<div class="winner-page">
    <h1>Predict the Champion</h1>
    <p class="subtitle">Pick who will lift the trophy! Worth 10 bonus points.</p>

    {#if countdown}
        <div class="deadline-notice">
            <span class="deadline-label">Picks lock in</span>
            <span class="deadline-countdown">
                {#if countdown.days > 0}<span class="cd-unit">{countdown.days}<em>d</em></span>{/if}
                <span class="cd-unit">{countdown.hours}<em>h</em></span>
                <span class="cd-unit">{String(countdown.minutes).padStart(2,'0')}<em>m</em></span>
                <span class="cd-unit">{String(countdown.seconds).padStart(2,'0')}<em>s</em></span>
            </span>
            <span class="deadline-date">Wed Jun 18 · 08:00 UTC+2</span>
        </div>
    {/if}

    {#if isLocked}
        <div class="locked-banner">
            🔒 The group stage has ended. Winner predictions are now locked.
        </div>
        {#if savedPrediction}
            <div class="locked-pick-display">
                <span class="trophy-icon">🏆</span>
                <div>
                    <div class="locked-pick-label">Your champion prediction</div>
                    <div class="locked-pick-name">{savedPrediction}</div>
                </div>
            </div>
        {:else}
            <p class="no-pick-msg">You did not submit a champion prediction.</p>
        {/if}
    {:else}
        <div class="teams-grid" class:has-bar={showBar}>
            {#each teams as team}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                    class="team-card"
                    class:selected={selectedTeam === team.name}
                    class:prev-saved={savedPrediction === team.name && selectedTeam !== team.name}
                    onclick={() => { selectedTeam = team.name; saveMsg = ''; }}>
                    {#if team.crest}
                        <img src={team.crest} alt="{team.name} flag" />
                    {/if}
                    <span>{team.name}</span>
                    {#if savedPrediction === team.name && selectedTeam !== team.name}
                        <span class="saved-badge">saved</span>
                    {/if}
                </div>
            {/each}
        </div>

        {#if saveMsg}
            <div class="msg {saveMsg.includes('Error') ? 'error' : 'success'}">{saveMsg}</div>
        {/if}

        {#if showBar}
            <div class="save-bar">
                {#if !savedPrediction && selectedTeam}
                    <!-- First-time pick -->
                    <div class="bar-info">
                        <span class="bar-icon">🏆</span>
                        <div class="bar-texts">
                            <span class="bar-label">Your pick</span>
                            <strong class="bar-team">{selectedTeam}</strong>
                        </div>
                    </div>
                    <button onclick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving…' : 'Lock it in!'}
                    </button>

                {:else if hasChange}
                    <!-- Changing an existing pick -->
                    <div class="bar-info change-info">
                        <div class="bar-texts">
                            <span class="bar-label">Change pick</span>
                            <span class="change-row">
                                <span class="from-team">{savedPrediction}</span>
                                <span class="change-arrow">→</span>
                                <strong class="to-team">{selectedTeam}</strong>
                            </span>
                        </div>
                    </div>
                    <button onclick={handleSave} disabled={isSaving}>
                        {isSaving ? 'Saving…' : 'Confirm Change'}
                    </button>

                {:else}
                    <!-- Saved pick, no pending change -->
                    <div class="bar-info">
                        <span class="bar-icon">🏆</span>
                        <div class="bar-texts">
                            <span class="bar-label">Your champion pick</span>
                            <strong class="bar-team">{savedPrediction}</strong>
                        </div>
                    </div>
                    <span class="bar-hint">Click another team to change</span>
                {/if}
            </div>
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

    /* Deadline notice */
    .deadline-notice {
        display: flex;
        align-items: center;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.6rem 1rem;
        background: rgba(251, 191, 36, 0.08);
        border: 1px solid rgba(251, 191, 36, 0.25);
        border-radius: 12px;
        padding: 0.65rem 1.25rem;
        margin-bottom: clamp(1rem, 3vw, 1.5rem);
    }
    .deadline-label {
        font-size: 0.8rem;
        color: #aaa;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .deadline-countdown {
        display: flex;
        gap: 0.35rem;
        align-items: baseline;
    }
    .cd-unit {
        font-size: clamp(1rem, 3vw, 1.2rem);
        font-weight: 700;
        color: var(--color-accent);
        font-variant-numeric: tabular-nums;
    }
    .cd-unit em {
        font-style: normal;
        font-size: 0.65em;
        font-weight: 400;
        color: #888;
        margin-left: 1px;
    }
    .deadline-date {
        font-size: 0.75rem;
        color: #666;
    }

    /* Locked state */
    .locked-banner {
        background: rgba(239, 68, 68, 0.15);
        color: var(--color-danger);
        padding: clamp(1rem, 3vw, 1.5rem);
        border-radius: 12px;
        text-align: center;
        font-size: clamp(0.95rem, 2vw, 1.1rem);
        margin-bottom: 1.5rem;
    }
    .locked-pick-display {
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 1rem;
        background: rgba(251, 191, 36, 0.1);
        border: 1px solid rgba(251, 191, 36, 0.3);
        border-radius: 12px;
        padding: 1.5rem 2rem;
        margin-top: 1rem;
    }
    .trophy-icon { font-size: 2rem; }
    .locked-pick-label { font-size: 0.85rem; color: #aaa; text-transform: uppercase; letter-spacing: 0.05em; }
    .locked-pick-name { font-size: clamp(1.2rem, 4vw, 1.6rem); font-weight: 700; color: var(--color-accent); }
    .no-pick-msg { text-align: center; color: #666; font-style: italic; margin-top: 1.5rem; }

    /* Team grid */
    .teams-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(clamp(110px, 22vw, 150px), 1fr));
        gap: clamp(0.6rem, 2vw, 1rem);
        margin-bottom: 1.5rem;
    }
    .teams-grid.has-bar {
        /* Extra bottom padding so last row isn't hidden behind the fixed bar */
        padding-bottom: clamp(5rem, 12vw, 7rem);
    }
    .team-card {
        position: relative;
        background: rgba(255, 255, 255, 0.05);
        border: 2px solid transparent;
        border-radius: 12px;
        padding: clamp(0.6rem, 2vw, 1rem) clamp(0.4rem, 1vw, 0.75rem);
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.4rem;
        cursor: pointer;
        transition: all 0.18s ease;
    }
    .team-card:hover {
        background: rgba(255, 255, 255, 0.1);
        transform: translateY(-2px);
    }
    .team-card.selected {
        background: rgba(251, 191, 36, 0.12);
        border-color: var(--color-accent);
        box-shadow: 0 0 14px rgba(251, 191, 36, 0.25);
    }
    /* Faint indicator for the previously-saved pick when something else is selected */
    .team-card.prev-saved {
        border-color: rgba(251, 191, 36, 0.3);
        background: rgba(251, 191, 36, 0.04);
    }
    .team-card img {
        width: clamp(44px, 11vw, 60px);
        height: clamp(30px, 7vw, 40px);
        object-fit: cover;
        border-radius: 4px;
    }
    .team-card span {
        text-align: center;
        font-size: clamp(0.72rem, 1.8vw, 0.88rem);
        font-weight: 600;
        word-break: break-word;
        line-height: 1.2;
    }
    .saved-badge {
        position: absolute;
        top: 4px;
        right: 6px;
        font-size: 0.55rem !important;
        font-weight: 700 !important;
        text-transform: uppercase;
        letter-spacing: 0.05em;
        color: var(--color-accent);
        background: rgba(251, 191, 36, 0.15);
        padding: 1px 5px;
        border-radius: 4px;
        word-break: normal;
    }

    /* Save message */
    .msg {
        text-align: center;
        font-size: clamp(0.85rem, 2vw, 1rem);
        margin-bottom: 0.5rem;
    }
    .msg.success { color: var(--color-success); }
    .msg.error   { color: var(--color-danger); }

    /* Fixed save bar */
    .save-bar {
        position: fixed;
        bottom: 1.25rem;
        left: 50%;
        transform: translateX(-50%);
        width: calc(100% - 2rem);
        max-width: 620px;
        box-sizing: border-box;
        background: rgba(15, 23, 42, 0.97);
        backdrop-filter: blur(12px);
        border: 1px solid var(--color-accent);
        padding: 0.75rem 1.25rem;
        border-radius: 50px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.55);
        z-index: 100;
    }
    .bar-info {
        display: flex;
        align-items: center;
        gap: 0.6rem;
        min-width: 0;
        flex: 1;
    }
    .bar-icon { font-size: 1.2rem; flex-shrink: 0; }
    .bar-texts {
        display: flex;
        flex-direction: column;
        min-width: 0;
    }
    .bar-label {
        font-size: 0.68rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        line-height: 1;
    }
    .bar-team {
        font-size: clamp(0.9rem, 2.5vw, 1.05rem);
        color: var(--color-accent);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }
    .bar-hint {
        font-size: 0.75rem;
        color: #666;
        white-space: nowrap;
        flex-shrink: 0;
    }

    /* Change-mode bar layout */
    .change-row {
        display: flex;
        align-items: center;
        gap: 0.4rem;
        flex-wrap: nowrap;
        min-width: 0;
    }
    .from-team {
        color: #aaa;
        font-size: clamp(0.8rem, 2vw, 0.95rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
    }
    .change-arrow { color: #666; font-size: 0.85rem; flex-shrink: 0; }
    .to-team {
        color: var(--color-accent);
        font-size: clamp(0.85rem, 2.2vw, 1rem);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
    }

    .save-bar button {
        background: var(--color-accent);
        color: var(--color-bg);
        border: none;
        padding: 0.5rem 1.25rem;
        border-radius: 20px;
        font-weight: 700;
        cursor: pointer;
        font-size: 0.88rem;
        white-space: nowrap;
        flex-shrink: 0;
        transition: opacity 0.2s;
    }
    .save-bar button:hover:not(:disabled) { opacity: 0.85; }
    .save-bar button:disabled { opacity: 0.55; cursor: not-allowed; }

    /* Mobile */
    @media (max-width: 480px) {
        .teams-grid {
            grid-template-columns: repeat(auto-fill, minmax(95px, 1fr));
        }
        .save-bar {
            bottom: 0.75rem;
            border-radius: 16px;
            flex-direction: column;
            align-items: stretch;
            padding: 0.9rem 1rem;
            gap: 0.6rem;
        }
        .bar-info {
            justify-content: center;
        }
        .bar-hint {
            text-align: center;
            white-space: normal;
        }
        .change-row {
            justify-content: center;
            flex-wrap: wrap;
        }
        .from-team, .to-team { max-width: none; }
        .save-bar button {
            width: 100%;
            padding: 0.65rem 1rem;
            border-radius: 10px;
            font-size: 0.95rem;
        }
    }
</style>
