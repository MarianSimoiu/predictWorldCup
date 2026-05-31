<script>
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    import { isPlaceholderTeam } from '../lib/db.js';
    
    // Stages in order
    const stageOrder = [
        'ROUND_OF_32',
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
        padding: 2rem;
        max-width: 1000px;
        margin: 0 auto;
    }
    h1 {
        text-align: center;
        color: var(--color-primary);
        margin-bottom: 2rem;
    }
    .empty-state {
        text-align: center;
        background: rgba(255, 255, 255, 0.05);
        padding: 3rem;
        border-radius: 12px;
        color: #aaa;
    }
    .stage-section {
        margin-bottom: 3rem;
    }
    h2 {
        color: var(--color-accent);
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.5rem;
        margin-bottom: 1.5rem;
    }
    .matches-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
        gap: 1.5rem;
    }
    .match-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 8px;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .match-info {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
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
    }
    .team {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
    }
    .team:last-child {
        justify-content: flex-end;
        text-align: right;
    }
    .flag {
        width: 24px;
        height: 16px;
        object-fit: cover;
    }
    .score {
        padding: 0.25rem 0.75rem;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
    }
    .predict-btn {
        display: block;
        text-align: center;
        background: rgba(56, 189, 248, 0.1);
        color: var(--color-primary);
        padding: 0.5rem;
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
        margin-top: 0.5rem;
    }
    .predict-btn:hover {
        background: var(--color-primary);
        color: var(--color-bg);
    }
    .user-prediction-preview {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 0.5rem;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.35rem;
        font-size: 0.85rem;
        margin-top: 0.5rem;
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
</style>
