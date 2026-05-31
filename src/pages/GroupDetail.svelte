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
        return new Date().getTime() < (kickoffTime - 60 * 60 * 1000);
    }
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
        {@const unpredictedMatches = predictableMatches.filter(m => !predictionStore.predictions[m.id])}
        {@const unpredictedCount = unpredictedMatches.length}
        
        {#if predictableMatches.length > 0}
            {#if unpredictedCount > 0}
                <div class="group-prediction-alert warning">
                    <span class="alert-icon">⚠️</span>
                    <span class="alert-text">
                        You have not locked in predictions for <strong>{unpredictedCount}</strong> match{unpredictedCount > 1 ? 'es' : ''} in this group.
                    </span>
                </div>
            {:else}
                <div class="group-prediction-alert success">
                    <span class="alert-icon">🎉</span>
                    <span class="alert-text">All predictions locked in for this group! Great job!</span>
                </div>
            {/if}
        {:else}
            <div class="group-prediction-alert success">
                <span class="alert-icon">⚽</span>
                <span class="alert-text">All matches in this group have started or finished.</span>
            </div>
        {/if}

        <div class="matches-list">
            {#each groupMatches as match}
                <div class="match-row">
                    <div class="match-info">
                        <span class="time">{formatTime(match.kickoff)}</span>
                        <span class="status {match.status.toLowerCase()}">{match.status}</span>
                    </div>
                    <div class="teams">
                        <div class="team">
                            {#if match.team1.crest}
                                <img src={match.team1.crest} alt="{match.team1.name} flag" class="flag" />
                            {/if}
                            <span class="name">{match.team1.name}</span>
                        </div>
                        <div class="score">
                            {#if match.status === 'FINISHED' || match.status === 'LIVE'}
                                {match.score.team1} - {match.score.team2}
                            {:else}
                                vs
                            {/if}
                        </div>
                        <div class="team">
                            <span class="name">{match.team2.name}</span>
                            {#if match.team2.crest}
                                <img src={match.team2.crest} alt="{match.team2.name} flag" class="flag" />
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
                        {:else if isPredictable(match)}
                            <div class="user-prediction-preview empty">
                                <span class="preview-label">⚠️ No prediction locked in</span>
                            </div>
                        {/if}
                    {/if}

                    <div class="actions">
                        <a href="#/match/{match.id}" class="predict-btn">
                            {match.status === 'FINISHED' ? 'View Result' : 'Predict'}
                        </a>
                    </div>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .group-detail {
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
    }
    .back-link {
        color: var(--color-secondary);
        text-decoration: none;
        display: inline-block;
        margin-bottom: 1rem;
    }
    .back-link:hover {
        text-decoration: underline;
    }
    h1 {
        text-transform: capitalize;
        color: var(--color-primary);
        margin-bottom: 2rem;
    }
    
    .matches-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }
    .match-row {
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
        font-size: 0.9rem;
        color: #aaa;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding-bottom: 0.5rem;
    }
    .status.live { color: var(--color-danger); font-weight: bold; animation: pulse 2s infinite; }
    .status.finished { color: var(--color-success); }
    
    .teams {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 1.25rem;
        font-weight: bold;
    }
    .team {
        display: flex;
        align-items: center;
        gap: 1rem;
        flex: 1;
    }
    .team:last-child {
        justify-content: flex-end;
        text-align: right;
    }
    .flag {
        width: 32px;
        height: 24px;
        object-fit: cover;
        border-radius: 2px;
    }
    .score {
        padding: 0.5rem 1rem;
        background: rgba(0, 0, 0, 0.3);
        border-radius: 4px;
        min-width: 60px;
        text-align: center;
    }
    
    .actions {
        display: flex;
        justify-content: center;
        margin-top: 0.5rem;
    }
    .predict-btn {
        background: linear-gradient(135deg, var(--color-primary), var(--color-secondary));
        color: white;
        text-decoration: none;
        padding: 0.5rem 2rem;
        border-radius: 20px;
        font-weight: bold;
        transition: transform 0.1s;
    }
    .predict-btn:hover {
        transform: scale(1.05);
    }
    
    .group-prediction-alert {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 1rem 1.5rem;
        border-radius: 12px;
        margin-bottom: 2rem;
        font-size: 1rem;
    }
    .group-prediction-alert.warning {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        color: #fbbf24;
    }
    .group-prediction-alert.success {
        background: rgba(16, 185, 129, 0.08);
        border: 1px solid rgba(16, 185, 129, 0.2);
        color: #34d399;
    }
    .alert-icon {
        font-size: 1.25rem;
    }

    .user-prediction-preview {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.05);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        display: flex;
        justify-content: center;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.9rem;
    }
    .user-prediction-preview.empty {
        background: rgba(239, 68, 68, 0.02);
        border: 1px solid rgba(239, 68, 68, 0.1);
        color: #f87171;
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
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
</style>
