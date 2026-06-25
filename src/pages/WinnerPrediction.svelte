<script>
    import { matchStore, userStore } from '../lib/stores.svelte.js';
    import { saveWinnerPrediction } from '../lib/db.js';
    import { doc, getDoc, collection, onSnapshot } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import { CHAMPION_LOCK_DEADLINE, CHAMPION_REOPEN_START, CHAMPION_REOPEN_UNTIL } from '../lib/config.js';

    let savedPrediction = $state(null);
    let selectedTeam = $state(null);
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

    let inReopenWindow = $derived(now >= CHAMPION_REOPEN_START && now < CHAMPION_REOPEN_UNTIL);
    let isLocked = $derived(now >= CHAMPION_LOCK_DEADLINE && !inReopenWindow);

    let countdown = $derived.by(() => {
        if (inReopenWindow) {
            const diff = CHAMPION_REOPEN_UNTIL - now;
            return { reopen: true, hours: Math.floor(diff / 3600000), minutes: Math.floor((diff % 3600000) / 60000), seconds: Math.floor((diff % 60000) / 1000) };
        }
        const diff = CHAMPION_LOCK_DEADLINE - now;
        if (diff <= 0) return null;
        return {
            days:    Math.floor(diff / 86400000),
            hours:   Math.floor((diff % 86400000) / 3600000),
            minutes: Math.floor((diff % 3600000)  / 60000),
            seconds: Math.floor((diff % 60000)    / 1000)
        };
    });

    let hasChange = $derived(selectedTeam !== null && selectedTeam !== savedPrediction);
    let showBar = $derived(!isLocked && (selectedTeam !== null || savedPrediction !== null));

    // All users (for community picks + leaderboard)
    let allUsers = $state([]);
    let championResult = $state(null); // set via config/championResult in Firestore

    $effect(() => {
        const unsubUsers = onSnapshot(collection(db, 'users'), (snap) => {
            const list = [];
            snap.forEach(d => list.push({ id: d.id, ...d.data() }));
            allUsers = list;
        });
        const unsubResult = onSnapshot(doc(db, 'config', 'championResult'), (snap) => {
            championResult = snap.exists() ? snap.data() : null;
        });
        return () => { unsubUsers(); unsubResult(); };
    });

    $effect(() => {
        if (!userStore.user) return;
        getDoc(doc(db, 'users', userStore.user.uid)).then(snap => {
            if (snap.exists() && snap.data().winnerPrediction) {
                savedPrediction = snap.data().winnerPrediction;
                selectedTeam = snap.data().winnerPrediction;
            }
        });
    });

    // Community picks grouped by team, sorted by votes desc
    let communityByTeam = $derived.by(() => {
        const map = new Map();
        for (const u of allUsers) {
            if (!u.winnerPrediction) continue;
            if (!map.has(u.winnerPrediction)) {
                const crest = teams.find(t => t.name === u.winnerPrediction)?.crest ?? null;
                map.set(u.winnerPrediction, { team: u.winnerPrediction, crest, pickers: [] });
            }
            map.get(u.winnerPrediction).pickers.push(u.displayName || u.email || 'Anonymous');
        }
        return Array.from(map.values()).sort((a, b) => b.pickers.length - a.pickers.length);
    });

    // Leaderboard tiers derived from championResult + allUsers
    let leaderboard = $derived.by(() => {
        const tier1 = championResult?.winner   ? allUsers.filter(u => u.winnerPrediction === championResult.winner)    : [];
        const tier2 = championResult?.finalist  ? allUsers.filter(u => u.winnerPrediction === championResult.finalist)  : [];
        const tier3 = championResult?.thirdPlace ? allUsers.filter(u => u.winnerPrediction === championResult.thirdPlace) : [];
        return { tier1, tier2, tier3 };
    });

    function pickerName(u) { return u.displayName || u.email || 'Anonymous'; }

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
        <div class="deadline-notice {countdown.reopen ? 'reopen' : ''}">
            <span class="deadline-label">{countdown.reopen ? '⚡ Reopen window closes in' : 'Picks lock in'}</span>
            <span class="deadline-countdown">
                {#if !countdown.reopen && countdown.days > 0}<span class="cd-unit">{countdown.days}<em>d</em></span>{/if}
                <span class="cd-unit">{countdown.hours}<em>h</em></span>
                <span class="cd-unit">{String(countdown.minutes).padStart(2,'0')}<em>m</em></span>
                <span class="cd-unit">{String(countdown.seconds).padStart(2,'0')}<em>s</em></span>
            </span>
            {#if !countdown.reopen}<span class="deadline-date">Wed Jun 18 · 08:00 UTC+2</span>{/if}
        </div>
    {/if}

    {#if isLocked}
        <div class="locked-banner">
            🔒 Winner predictions are locked.
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

    <!-- Community Picks -->
    <div class="section-block">
        <h2 class="section-title">🌍 Community Picks</h2>
        {#if communityByTeam.length === 0}
            <p class="empty-msg">No picks submitted yet.</p>
        {:else}
            <div class="cp-list">
                {#each communityByTeam as entry}
                    <div class="cp-row">
                        <div class="cp-team-info">
                            {#if entry.crest}
                                <img src={entry.crest} alt={entry.team} class="cp-crest" />
                            {/if}
                            <span class="cp-team-name">{entry.team}</span>
                            <span class="cp-vote-count">{entry.pickers.length} {entry.pickers.length === 1 ? 'pick' : 'picks'}</span>
                        </div>
                        <div class="cp-pickers">{entry.pickers.join(' · ')}</div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- Champion Leaderboard -->
    <div class="section-block">
        <h2 class="section-title">🏅 Champion Leaderboard</h2>
        <p class="section-sub">Points awarded once the tournament concludes.</p>
        <div class="lb-tiers">
            <div class="lb-tier lb-gold">
                <div class="lb-tier-header">
                    <span class="lb-medal">🥇</span>
                    <div class="lb-tier-info">
                        <span class="lb-tier-label">Tournament Winner</span>
                        {#if championResult?.winner}
                            <span class="lb-tier-team">{championResult.winner}</span>
                        {/if}
                    </div>
                    <span class="lb-pts">+16 pts</span>
                </div>
                {#if leaderboard.tier1.length > 0}
                    <div class="lb-users">{leaderboard.tier1.map(pickerName).join(' · ')}</div>
                {:else}
                    <div class="lb-empty">— Results pending</div>
                {/if}
            </div>

            <div class="lb-tier lb-silver">
                <div class="lb-tier-header">
                    <span class="lb-medal">🥈</span>
                    <div class="lb-tier-info">
                        <span class="lb-tier-label">Finalist (Runner-up)</span>
                        {#if championResult?.finalist}
                            <span class="lb-tier-team">{championResult.finalist}</span>
                        {/if}
                    </div>
                    <span class="lb-pts">+10 pts</span>
                </div>
                {#if leaderboard.tier2.length > 0}
                    <div class="lb-users">{leaderboard.tier2.map(pickerName).join(' · ')}</div>
                {:else}
                    <div class="lb-empty">— Results pending</div>
                {/if}
            </div>

            <div class="lb-tier lb-bronze">
                <div class="lb-tier-header">
                    <span class="lb-medal">🥉</span>
                    <div class="lb-tier-info">
                        <span class="lb-tier-label">3rd Place Winner</span>
                        {#if championResult?.thirdPlace}
                            <span class="lb-tier-team">{championResult.thirdPlace}</span>
                        {/if}
                    </div>
                    <span class="lb-pts">+6 pts</span>
                </div>
                {#if leaderboard.tier3.length > 0}
                    <div class="lb-users">{leaderboard.tier3.map(pickerName).join(' · ')}</div>
                {:else}
                    <div class="lb-empty">— Results pending</div>
                {/if}
            </div>
        </div>
    </div>
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

    /* Community + Leaderboard sections */
    .section-block {
        margin-top: 2.5rem;
        padding-top: 2rem;
        border-top: 1px solid rgba(255, 255, 255, 0.08);
    }
    .section-title {
        font-size: clamp(1.1rem, 3vw, 1.35rem);
        font-weight: 700;
        color: #fff;
        margin-bottom: 0.4rem;
    }
    .section-sub {
        font-size: 0.82rem;
        color: #666;
        margin-bottom: 1.25rem;
    }
    .empty-msg { color: #555; font-style: italic; font-size: 0.9rem; }

    /* Community picks list */
    .cp-list { display: flex; flex-direction: column; gap: 0.55rem; }
    .cp-row {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.07);
        border-radius: 10px;
        padding: 0.7rem 1rem;
    }
    .cp-team-info {
        display: flex;
        align-items: center;
        gap: 0.55rem;
        margin-bottom: 0.3rem;
    }
    .cp-crest {
        width: 28px;
        height: 20px;
        object-fit: cover;
        border-radius: 3px;
        flex-shrink: 0;
    }
    .cp-team-name { font-weight: 700; color: #fff; font-size: 0.95rem; }
    .cp-vote-count {
        margin-left: auto;
        font-size: 0.75rem;
        font-weight: 700;
        color: var(--color-accent);
        background: rgba(251, 191, 36, 0.1);
        border: 1px solid rgba(251, 191, 36, 0.2);
        padding: 0.1rem 0.5rem;
        border-radius: 20px;
    }
    .cp-pickers { font-size: 0.8rem; color: #888; padding-left: 0.1rem; }

    /* Leaderboard tiers */
    .lb-tiers { display: flex; flex-direction: column; gap: 0.75rem; }
    .lb-tier {
        border-radius: 12px;
        padding: 1rem 1.25rem;
        border: 1px solid transparent;
    }
    .lb-gold   { background: rgba(251,191,36,0.07);  border-color: rgba(251,191,36,0.2); }
    .lb-silver { background: rgba(203,213,225,0.05); border-color: rgba(203,213,225,0.15); }
    .lb-bronze { background: rgba(180,120,60,0.07);  border-color: rgba(180,120,60,0.2); }
    .lb-tier-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 0.5rem;
    }
    .lb-medal { font-size: 1.5rem; flex-shrink: 0; }
    .lb-tier-info {
        display: flex;
        flex-direction: column;
        flex: 1;
        min-width: 0;
    }
    .lb-tier-label { font-size: 0.78rem; color: #888; text-transform: uppercase; letter-spacing: 0.06em; }
    .lb-tier-team  { font-size: 0.95rem; font-weight: 700; color: #fff; }
    .lb-pts {
        font-size: 0.9rem;
        font-weight: 800;
        color: var(--color-accent);
        flex-shrink: 0;
    }
    .lb-users { font-size: 0.88rem; color: #ccc; font-weight: 600; padding-left: 2.25rem; }
    .lb-empty { font-size: 0.82rem; color: #444; font-style: italic; padding-left: 2.25rem; }

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
