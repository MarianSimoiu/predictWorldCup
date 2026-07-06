<script>
    import { matchStore, userStore, predictionStore } from '../lib/stores.svelte.js';
    import PredictionCard from '../components/PredictionCard.svelte';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    import { isKnockoutStage } from '../lib/scoring.js';

    let { params = {} } = $props();
    
    let matchId = $derived(params.id);
    let match = $derived(matchStore.matches.find(m => String(m.id) === matchId));
    
    let prediction = $derived(predictionStore.predictions[matchId] || null);
    let loadingPrediction = $derived(predictionStore.loading);

    function formatTime(date) {
        if (!date) return '';
        return new Intl.DateTimeFormat('default', {
            weekday: 'long', month: 'long', day: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }).format(date);
    }

    // The final score can include extra time; expose the 90-minute score when it differs.
    function departureTag(m) {
        if (m.actualDepartureMethod === 'EXTRA_TIME') return 'a.e.t.';
        if (m.actualDepartureMethod === 'PENALTY_SHOOTOUT') return 'pens';
        return '';
    }
    function has90Split(m) {
        return m.score90 && m.score
            && m.score90.team1 != null && m.score90.team2 != null
            && (m.score90.team1 !== m.score.team1 || m.score90.team2 !== m.score.team2);
    }
</script>

<div class="match-detail">
    <button class="back-link" onclick={() => history.back()}>← Back</button>
    
    {#if matchStore.error}
        <ErrorMessage error={matchStore.error} context="Match Detail" />
    {:else if matchStore.loading || loadingPrediction}
        <div class="loading">Loading match data...</div>
    {:else if !match}
        <div class="error">Match not found.</div>
    {:else}
        <div class="scoreboard">
            <div class="meta">
                <span class="stage">{match.stage.replace('_', ' ')}</span>
                <span class="date">{formatTime(match.kickoff)}</span>
                <span class="status {match.status.toLowerCase()}">{match.status}</span>
            </div>
            
            <div class="teams-container">
                <div class="team home">
                    {#if match.team1.crest}
                        <img src={match.team1.crest} alt="Flag" class="big-flag" />
                    {/if}
                    <h2 class="team-name">{match.team1.name}</h2>
                </div>
                
                <div class="score">
                    {#if match.status === 'FINISHED' || match.status === 'LIVE'}
                        <div class="score-numbers">
                            {match.score.team1} - {match.score.team2}
                        </div>
                        {#if match.status === 'FINISHED' && isKnockoutStage(match.stage)}
                            {@const tag = departureTag(match)}
                            {#if tag}<div class="score-tag">{tag}</div>{/if}
                            {#if has90Split(match)}
                                <div class="score-90">90 min: {match.score90.team1} - {match.score90.team2}</div>
                            {/if}
                        {/if}
                    {:else}
                        <div class="vs">VS</div>
                    {/if}
                </div>
                
                <div class="team away">
                    {#if match.team2.crest}
                        <img src={match.team2.crest} alt="Flag" class="big-flag" />
                    {/if}
                    <h2 class="team-name">{match.team2.name}</h2>
                </div>
            </div>
        </div>

        <PredictionCard {match} existingPrediction={prediction} />
    {/if}
</div>

<style>
    .match-detail {
        padding: clamp(0.75rem, 3vw, 2rem);
        max-width: 800px;
        margin: 0 auto;
        /* Prevent any child from escaping the viewport */
        overflow-x: hidden;
    }
    .back-link {
        background: none;
        border: none;
        cursor: pointer;
        color: var(--color-secondary);
        text-decoration: none;
        display: inline-block;
        margin-bottom: 1.5rem;
        font-size: clamp(0.85rem, 2.5vw, 1rem);
        padding: 0;
    }
    .back-link:hover { text-decoration: underline; }

    .scoreboard {
        background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: clamp(1rem, 4vw, 2rem);
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
        overflow: hidden;
    }

    .meta {
        display: flex;
        justify-content: center;
        flex-wrap: wrap;
        gap: 0.35rem 0.75rem;
        font-size: clamp(0.65rem, 2vw, 0.9rem);
        color: #aaa;
        margin-bottom: clamp(1rem, 3vw, 2rem);
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .status.live { color: var(--color-danger); font-weight: bold; animation: pulse 2s infinite; }
    .status.finished { color: var(--color-success); }

    .teams-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 0.25rem;
    }
    .team {
        flex: 1;
        min-width: 0; /* allow shrinking past content size */
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: clamp(0.4rem, 1.5vw, 1rem);
    }
    .big-flag {
        width: clamp(48px, 14vw, 100px);
        height: clamp(32px, 9vw, 70px);
        object-fit: cover;
        border-radius: 6px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
        flex-shrink: 0;
    }
    .team-name {
        margin: 0;
        font-size: clamp(0.75rem, 3.2vw, 1.5rem);
        line-height: 1.2;
        word-break: break-word;
        overflow-wrap: break-word;
        max-width: 100%;
    }

    .score {
        flex-shrink: 0;
        padding: 0 clamp(0.4rem, 2vw, 2rem);
    }
    .vs {
        font-size: clamp(1rem, 4vw, 2rem);
        font-weight: bold;
        color: #555;
    }
    .score-numbers {
        font-size: clamp(1.6rem, 7vw, 3.5rem);
        font-weight: 800;
        color: var(--color-primary);
        text-shadow: 0 2px 10px rgba(56, 189, 248, 0.3);
        white-space: nowrap;
    }
    .score-tag {
        margin-top: 0.15rem;
        font-size: clamp(0.6rem, 2vw, 0.75rem);
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--color-accent, #fbbf24);
    }
    .score-90 {
        margin-top: 0.1rem;
        font-size: clamp(0.65rem, 2vw, 0.85rem);
        font-weight: 600;
        color: #9aa0aa;
        white-space: nowrap;
    }

    .loading, .error {
        text-align: center;
        padding: 3rem;
        font-size: 1.2rem;
    }
    .error { color: var(--color-danger); }

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
</style>
