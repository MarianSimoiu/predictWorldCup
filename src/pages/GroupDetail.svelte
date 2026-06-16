<script>
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import { isPlaceholderTeam } from '../lib/db.js';

    let { params = {} } = $props();

    let groupId = $derived(params.id);
    let groupMatches = $derived(matchStore.matches.filter(m => m.group === groupId));

    function formatTime(date) {
        return new Intl.DateTimeFormat('default', {
            month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
        }).format(date);
    }

    function isPredictable(match) {
        if (isPlaceholderTeam(match.team1?.name) || isPlaceholderTeam(match.team2?.name)) return false;
        if (match.status !== 'SCHEDULED' && match.status !== 'TIMED') return false;
        if (!match.kickoff) return false;
        const kickoffTime = match.kickoff instanceof Date ? match.kickoff.getTime() : new Date(match.kickoff).getTime();
        return Date.now() < kickoffTime - 60 * 60 * 1000;
    }

    // Group-level summary derived from finished matches
    let groupSummary = $derived.by(() => {
        if (predictionStore.loading) return null;
        let pts = 0, played = 0, correct = 0, scored = 0;
        for (const m of groupMatches) {
            if (m.status !== 'FINISHED') continue;
            played++;
            const p = predictionStore.predictions[m.id];
            if (!p) continue;
            pts += p.pointsAwarded || 0;
            if (p.resultCorrect !== null) {
                scored++;
                if (p.resultCorrect || p.goalsCorrect) correct++;
            }
        }
        return { pts, played, correct, scored };
    });
</script>

<div class="group-detail">
    <a href="#/groups" class="back-link">← Back to Groups</a>
    <h1>{groupId ? groupId.replace('_', ' ') : 'Group'}</h1>

    {#if matchStore.loading || predictionStore.loading}
        <p>Loading matches...</p>
    {:else if groupMatches.length === 0}
        <p>No matches found for this group.</p>
    {:else}
        {@const predictableMatches = groupMatches.filter(isPredictable)}
        {@const unpredictedCount = predictableMatches.filter(m => !predictionStore.predictions[m.id]).length}

        <!-- Prediction status alert -->
        {#if predictableMatches.length > 0}
            {#if unpredictedCount > 0}
                <div class="alert warning">
                    <span>⚠️</span>
                    <span>You have <strong>{unpredictedCount}</strong> open match{unpredictedCount > 1 ? 'es' : ''} without a prediction.</span>
                </div>
            {:else}
                <div class="alert success">
                    <span>🎉</span>
                    <span>All predictions locked in for this group!</span>
                </div>
            {/if}
        {:else}
            <div class="alert success">
                <span>⚽</span>
                <span>All matches in this group have started or finished.</span>
            </div>
        {/if}

        <!-- Group summary bar -->
        {#if groupSummary && groupSummary.played > 0}
            <div class="group-summary">
                <div class="gs-stat">
                    <span class="gs-val">{groupSummary.pts}</span>
                    <span class="gs-lbl">pts earned</span>
                </div>
                <div class="gs-divider"></div>
                <div class="gs-stat">
                    <span class="gs-val">{groupSummary.scored > 0 ? `${groupSummary.correct}/${groupSummary.scored}` : '—'}</span>
                    <span class="gs-lbl">correct picks</span>
                </div>
                <div class="gs-divider"></div>
                <div class="gs-stat">
                    <span class="gs-val">{groupSummary.played}/{groupMatches.length}</span>
                    <span class="gs-lbl">played</span>
                </div>
            </div>
        {/if}

        <div class="matches-list">
            {#each groupMatches as match}
                {@const pred = predictionStore.predictions[match.id]}
                {@const isFinished = match.status === 'FINISHED'}
                {@const isScored = pred && pred.resultCorrect !== null}

                <div class="match-card" class:finished={isFinished}>
                    <!-- Header row: time + status -->
                    <div class="match-header">
                        <span class="match-time">{formatTime(match.kickoff)}</span>
                        <span class="status status-{match.status.toLowerCase()}">{match.status}</span>
                    </div>

                    <!-- Teams row -->
                    <div class="teams-row">
                        <div class="team home">
                            {#if match.team1.crest}
                                <img src={match.team1.crest} alt="" class="flag" />
                            {/if}
                            <span class="team-name">{match.team1.name}</span>
                        </div>

                        <div class="score-box">
                            {#if isFinished || match.status === 'LIVE'}
                                <span class="score-val">{match.score.team1} - {match.score.team2}</span>
                                {#if match.status === 'LIVE'}
                                    <span class="live-tag">LIVE</span>
                                {/if}
                            {:else}
                                <span class="vs-text">vs</span>
                            {/if}
                        </div>

                        <div class="team away">
                            <span class="team-name">{match.team2.name}</span>
                            {#if match.team2.crest}
                                <img src={match.team2.crest} alt="" class="flag" />
                            {/if}
                        </div>
                    </div>

                    <!-- Prediction + stats row -->
                    {#if pred}
                        <div class="pred-row">
                            <div class="pred-pick">
                                <span class="pred-label">Your pick:</span>
                                <span class="pred-val">
                                    {pred.predictedResult === 'team1' ? match.team1.name
                                     : pred.predictedResult === 'team2' ? match.team2.name
                                     : 'Draw'}
                                    {#if pred.predictedGoalsTier}
                                        <span class="pred-goals">• {pred.predictedGoalsTier} Goals</span>
                                    {/if}
                                </span>
                            </div>

                            {#if isFinished && isScored}
                                <div class="pred-stats">
                                    <span class="check" class:hit={pred.resultCorrect} class:miss={!pred.resultCorrect}>
                                        {pred.resultCorrect ? '✅' : '❌'} Result
                                    </span>
                                    {#if pred.predictedGoalsTier}
                                        <span class="check" class:hit={pred.goalsCorrect} class:miss={!pred.goalsCorrect}>
                                            {pred.goalsCorrect ? '✅' : '❌'} Goals
                                        </span>
                                    {/if}
                                    <span class="pts-badge pts-{pred.pointsAwarded}">+{pred.pointsAwarded} pts</span>
                                </div>
                            {:else if isFinished && !isScored}
                                <div class="pred-stats">
                                    <span class="pending-score">Scoring pending…</span>
                                </div>
                            {/if}
                        </div>
                    {:else if isPredictable(match)}
                        <div class="no-pred-row">
                            ⚠️ No prediction yet
                        </div>
                    {/if}

                    <!-- Action button -->
                    <div class="actions">
                        <a href="#/match/{match.id}" class="action-btn">
                            {isFinished ? 'View Result' : isPredictable(match) ? (pred ? 'Edit Prediction' : 'Predict') : 'View Match'}
                        </a>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .group-detail {
        padding: clamp(0.75rem, 3vw, 2rem);
        max-width: 800px;
        margin: 0 auto;
        overflow-x: hidden;
    }
    .back-link {
        color: var(--color-secondary);
        text-decoration: none;
        display: inline-block;
        margin-bottom: 0.75rem;
        font-size: clamp(0.85rem, 2.5vw, 1rem);
    }
    .back-link:hover { text-decoration: underline; }
    h1 {
        text-transform: capitalize;
        color: var(--color-primary);
        font-size: clamp(1.3rem, 5vw, 2rem);
        margin-bottom: clamp(1rem, 3vw, 1.5rem);
    }

    /* Alert banner */
    .alert {
        display: flex;
        align-items: flex-start;
        gap: 0.6rem;
        padding: clamp(0.65rem, 2vw, 1rem) clamp(0.75rem, 2vw, 1.25rem);
        border-radius: 10px;
        margin-bottom: clamp(0.75rem, 2vw, 1.25rem);
        font-size: clamp(0.82rem, 2.2vw, 1rem);
        line-height: 1.4;
    }
    .alert.warning { background: rgba(245,158,11,0.08); border: 1px solid rgba(245,158,11,0.2); color: #fbbf24; }
    .alert.success { background: rgba(16,185,129,0.08); border: 1px solid rgba(16,185,129,0.2); color: #34d399; }

    /* Group summary bar */
    .group-summary {
        display: flex;
        align-items: center;
        background: rgba(255,255,255,0.04);
        border: 1px solid rgba(255,255,255,0.08);
        border-radius: 10px;
        padding: clamp(0.5rem, 2vw, 0.75rem) clamp(0.75rem, 2vw, 1.25rem);
        margin-bottom: clamp(0.75rem, 2vw, 1.25rem);
        gap: 0;
    }
    .gs-stat {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.1rem;
    }
    .gs-val {
        font-size: clamp(1rem, 3.5vw, 1.3rem);
        font-weight: 700;
        color: var(--color-primary);
    }
    .gs-lbl {
        font-size: clamp(0.6rem, 1.5vw, 0.7rem);
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.04em;
    }
    .gs-divider {
        width: 1px;
        height: 2rem;
        background: rgba(255,255,255,0.08);
        flex-shrink: 0;
    }

    /* Match cards */
    .matches-list { display: flex; flex-direction: column; gap: clamp(0.6rem, 2vw, 1rem); }

    .match-card {
        background: rgba(255,255,255,0.05);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 10px;
        padding: clamp(0.75rem, 2.5vw, 1.25rem);
        display: flex;
        flex-direction: column;
        gap: clamp(0.5rem, 1.5vw, 0.75rem);
    }
    .match-card.finished {
        border-left: 3px solid rgba(255,255,255,0.15);
    }

    /* Header */
    .match-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: clamp(0.7rem, 2vw, 0.85rem);
        color: #888;
        padding-bottom: clamp(0.35rem, 1vw, 0.5rem);
        border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .status-live { color: var(--color-danger); font-weight: 700; animation: pulse 2s infinite; }
    .status-finished { color: var(--color-success); }
    .status-scheduled, .status-timed { color: #aaa; }

    /* Teams row */
    .teams-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: clamp(0.25rem, 1vw, 0.5rem);
        overflow: hidden;
    }
    .team {
        display: flex;
        align-items: center;
        gap: clamp(0.3rem, 1.5vw, 0.6rem);
        flex: 1;
        min-width: 0;
    }
    .team.home { justify-content: flex-start; }
    .team.away { justify-content: flex-end; }
    .flag {
        width: clamp(22px, 6vw, 32px);
        height: clamp(15px, 4vw, 22px);
        object-fit: cover;
        border-radius: 2px;
        flex-shrink: 0;
    }
    .team-name {
        font-size: clamp(0.78rem, 2.8vw, 1.05rem);
        font-weight: 600;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        min-width: 0;
    }
    .score-box {
        flex-shrink: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.15rem;
        padding: 0.25rem clamp(0.4rem, 2vw, 0.75rem);
        background: rgba(0,0,0,0.3);
        border-radius: 6px;
        min-width: clamp(44px, 12vw, 60px);
    }
    .score-val {
        font-size: clamp(0.9rem, 3vw, 1.2rem);
        font-weight: 800;
        color: var(--color-primary);
        white-space: nowrap;
    }
    .vs-text {
        font-size: clamp(0.75rem, 2vw, 0.9rem);
        color: #555;
        font-weight: 600;
    }
    .live-tag {
        font-size: 0.55rem;
        font-weight: 800;
        background: var(--color-danger);
        color: #fff;
        padding: 1px 4px;
        border-radius: 3px;
        letter-spacing: 0.05em;
    }

    /* Prediction row */
    .pred-row {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 0.4rem clamp(0.5rem, 2vw, 1rem);
        background: rgba(255,255,255,0.02);
        border: 1px solid rgba(255,255,255,0.05);
        border-radius: 8px;
        padding: clamp(0.4rem, 1.5vw, 0.65rem) clamp(0.5rem, 2vw, 0.85rem);
    }
    .pred-pick {
        display: flex;
        align-items: baseline;
        gap: 0.4rem;
        flex-wrap: wrap;
        min-width: 0;
    }
    .pred-label { font-size: clamp(0.7rem, 1.8vw, 0.8rem); color: #888; flex-shrink: 0; }
    .pred-val { font-size: clamp(0.78rem, 2.2vw, 0.9rem); color: var(--color-primary); font-weight: 600; }
    .pred-goals { color: var(--color-accent); }

    .pred-stats {
        display: flex;
        align-items: center;
        gap: clamp(0.3rem, 1.5vw, 0.6rem);
        flex-wrap: wrap;
        flex-shrink: 0;
    }
    .check {
        font-size: clamp(0.7rem, 1.8vw, 0.8rem);
        white-space: nowrap;
    }
    .check.hit { color: var(--color-success); }
    .check.miss { color: #94a3b8; }
    .pending-score { font-size: 0.75rem; color: #666; font-style: italic; }

    /* Points badge */
    .pts-badge {
        font-size: clamp(0.72rem, 1.8vw, 0.82rem);
        font-weight: 700;
        padding: 0.15rem 0.5rem;
        border-radius: 4px;
        white-space: nowrap;
    }
    .pts-badge.pts-6 { background: rgba(16,185,129,0.15); color: var(--color-success); border: 1px solid rgba(16,185,129,0.3); }
    .pts-badge.pts-3 { background: rgba(251,191,36,0.15); color: var(--color-accent); border: 1px solid rgba(251,191,36,0.3); }
    .pts-badge.pts-0 { background: rgba(239,68,68,0.08); color: #94a3b8; border: 1px solid rgba(239,68,68,0.15); }

    .no-pred-row {
        font-size: clamp(0.78rem, 2vw, 0.88rem);
        color: #f87171;
        background: rgba(239,68,68,0.05);
        border: 1px solid rgba(239,68,68,0.12);
        border-radius: 8px;
        padding: clamp(0.35rem, 1.5vw, 0.55rem) clamp(0.5rem, 2vw, 0.85rem);
    }

    /* Action button */
    .actions { display: flex; justify-content: center; }
    .action-btn {
        background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
        color: white;
        text-decoration: none;
        padding: clamp(0.4rem, 1.5vw, 0.55rem) clamp(1.25rem, 5vw, 2rem);
        border-radius: 20px;
        font-weight: 700;
        font-size: clamp(0.8rem, 2vw, 0.9rem);
        transition: transform 0.15s, opacity 0.15s;
        width: 100%;
        text-align: center;
    }
    .action-btn:hover { opacity: 0.9; transform: translateY(-1px); }

    @keyframes pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.5; }
    }
</style>
