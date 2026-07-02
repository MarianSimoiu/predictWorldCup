<script>
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    import { isPlaceholderTeam } from '../lib/db.js';
    
    // Stages in order
    // football-data.org v4 uses LAST_32 / LAST_16 for the 2026 WC; include ROUND_OF_* variants for safety
    const stageOrder = [
        'LAST_32',
        'ROUND_OF_32',
        'LAST_16',
        'ROUND_OF_16',
        'QUARTER_FINALS',
        'SEMI_FINALS',
        'THIRD_PLACE',
        'FINAL'
    ];

    let groupedMatches = $derived.by(() => {
        const stages = {};
        for (const match of matchStore.matches) {
            if (match.stage === 'GROUP_STAGE' || !match.stage) continue;
            
            if (!stages[match.stage]) {
                stages[match.stage] = [];
            }
            stages[match.stage].push(match);
        }
        
        // Sort by stage order
        return Object.entries(stages)
            .sort((a, b) => stageOrder.indexOf(a[0]) - stageOrder.indexOf(b[0]))
            .map(([stage, matches]) => ({
                stage: stage.replace(/_/g, ' '),
                matches: matches.sort((a, b) => a.kickoff - b.kickoff)
            }));
    });

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
        return new Date().getTime() < (kickoffTime - 60 * 60 * 1000);
    }
</script>

<div class="knockout-page">
    <h1>Knockout Stage</h1>
    
    {#if matchStore.error}
        <ErrorMessage error={matchStore.error} context="Knockout Stage" />
    {:else if matchStore.loading}
        <p>Loading matches...</p>
    {:else if groupedMatches.length === 0}
        <div class="empty-state">
            Knockout matches will appear here once the group stage concludes and teams advance.
        </div>
    {:else}
        {#each groupedMatches as { stage, matches }}
            <div class="stage-section">
                <h2>{stage}</h2>
                <div class="matches-grid">
                    {#each matches as match}
                        {@const teamsPlaceholder = isPlaceholderTeam(match.team1?.name) || isPlaceholderTeam(match.team2?.name)}
                        <div class="match-card" class:pending-lock={teamsPlaceholder}>
                            <div class="match-info">
                                <span class="time">{formatTime(match.kickoff)}</span>
                                {#if teamsPlaceholder}
                                    <span class="status pending-teams">PENDING TEAMS 🔒</span>
                                {:else}
                                    <span class="status {match.status.toLowerCase()}">{match.status}</span>
                                {/if}
                            </div>
                            <div class="teams">
                                <div class="team">
                                    {#if match.team1.crest}
                                        <img src={match.team1.crest} alt="flag" class="flag" />
                                    {/if}
                                    <span>{match.team1.name}</span>
                                </div>
                                <div class="score">
                                    {#if match.status === 'FINISHED' || match.status === 'LIVE'}
                                        {match.score.team1} - {match.score.team2}
                                    {:else}
                                        vs
                                    {/if}
                                </div>
                                <div class="team">
                                    <span>{match.team2.name}</span>
                                    {#if match.team2.crest}
                                        <img src={match.team2.crest} alt="flag" class="flag" />
                                    {/if}
                                </div>
                            </div>
                            {#if !predictionStore.loading}
                                {@const pred = predictionStore.predictions[match.id]}
                                {#if pred}
                                    <div class="user-prediction-preview">
                                        <span class="preview-label">Your prediction:</span>
                                        <span class="preview-value">
                                            {pred.predictedResult === 'team1' ? match.team1.name : pred.predictedResult === 'team2' ? match.team2.name : 'Draw'}
                                            {#if pred.predictedGoalsTier}
                                                <span class="preview-goals"> • {pred.predictedGoalsTier} Goals</span>
                                            {/if}
                                        </span>
                                    </div>
                                {:else if teamsPlaceholder}
                                    <div class="user-prediction-preview pending">
                                        <span class="preview-label">Predictions locked until teams qualify</span>
                                    </div>
                                {:else if isPredictable(match)}
                                    <div class="user-prediction-preview empty">
                                        <span class="preview-label">⚠️ No prediction locked in</span>
                                    </div>
                                {/if}
                            {/if}
                            <a href="#/match/{match.id}" class="predict-btn">
                                {match.status === 'FINISHED' ? 'View Result' : teamsPlaceholder ? 'View Details' : 'Predict'}
                            </a>
                        </div>
                    {/each}
                </div>
            </div>
        {/each}
    {/if}
</div>

<style>
    .knockout-page {
        padding: clamp(1rem, 3vw, 2rem);
        max-width: 1000px;
        margin: 0 auto;
        width: 100%;
    }
    h1 {
        text-align: center;
        color: var(--color-primary);
        margin-bottom: clamp(1rem, 3vw, 2rem);
        font-size: clamp(1.5rem, 5vw, 2.5rem);
    }
    .empty-state {
        text-align: center;
        background: rgba(255, 255, 255, 0.05);
        padding: clamp(2rem, 5vw, 3rem);
        border-radius: 12px;
        color: #aaa;
        font-size: clamp(0.9rem, 2vw, 1rem);
    }
    .stage-section {
        margin-bottom: clamp(2rem, 5vw, 3rem);
    }
    h2 {
        color: var(--color-accent);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: clamp(0.5rem, 1vw, 0.75rem);
        margin-bottom: clamp(1rem, 3vw, 1.5rem);
        font-size: clamp(1.1rem, 4vw, 1.5rem);
    }
    .matches-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(clamp(250px, 40vw, 300px), 1fr));
        gap: clamp(1rem, 2vw, 1.5rem);
    }
    .match-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: clamp(1rem, 2vw, 1.5rem);
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .match-info {
        display: flex;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 0.5rem;
        font-size: clamp(0.75rem, 2vw, 0.85rem);
        color: #888;
    }
    .status.live { color: var(--color-danger); font-weight: bold; }
    .status.finished { color: var(--color-success); }
    .status.pending-teams {
        color: var(--color-accent);
        font-weight: bold;
    }
    
    .teams {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-weight: bold;
        gap: clamp(0.5rem, 2vw, 1rem);
        flex-wrap: wrap;
    }
    .team {
        display: flex;
        align-items: center;
        gap: clamp(0.25rem, 1vw, 0.5rem);
        flex: 1;
        min-width: 0;
        font-size: clamp(0.8rem, 2vw, 0.95rem);
    }
    .team:last-child {
        justify-content: flex-end;
        text-align: right;
    }
    .flag {
        width: clamp(18px, 4vw, 24px);
        height: clamp(12px, 3vw, 16px);
        object-fit: cover;
        flex-shrink: 0;
    }
    .score {
        padding: clamp(0.25rem, 1vw, 0.5rem) clamp(0.5rem, 1vw, 0.75rem);
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        font-size: clamp(0.8rem, 2vw, 0.9rem);
        white-space: nowrap;
    }
    .predict-btn {
        display: block;
        text-align: center;
        background: rgba(56, 189, 248, 0.1);
        color: var(--color-primary);
        padding: clamp(0.4rem, 1vw, 0.5rem);
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
        margin-top: 0.5rem;
        font-size: clamp(0.8rem, 2vw, 0.9rem);
    }
    .predict-btn:hover {
        background: var(--color-primary);
        color: var(--color-bg);
    }
    .user-prediction-preview {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: clamp(0.4rem, 1vw, 0.5rem);
        display: flex;
        justify-content: center;
        align-items: center;
        gap: clamp(0.2rem, 1vw, 0.35rem);
        font-size: clamp(0.75rem, 2vw, 0.85rem);
        margin-top: 0.5rem;
        flex-wrap: wrap;
    }
    .user-prediction-preview.empty {
        background: rgba(239, 68, 68, 0.02);
        border: 1px solid rgba(239, 68, 68, 0.1);
        color: #f87171;
    }
    .user-prediction-preview.pending {
        background: rgba(245, 158, 11, 0.02);
        border: 1px solid rgba(245, 158, 11, 0.15);
        color: #fbbf24;
    }
    .match-card.pending-lock {
        border-color: rgba(245, 158, 11, 0.15);
        background: rgba(245, 158, 11, 0.02);
    }
    .preview-label {
        color: #888;
    }
    .preview-value {
        color: var(--color-primary);
        font-weight: bold;
    }
    .preview-goals {
        color: var(--color-accent);
    }

    @media (max-width: 640px) {
        .matches-grid {
            grid-template-columns: 1fr;
        }
        .teams {
            flex-direction: column;
            gap: 0.75rem;
        }
        .team {
            justify-content: center;
            width: 100%;
        }
        .team:last-child {
            justify-content: center;
            text-align: center;
        }
    }
</style>
