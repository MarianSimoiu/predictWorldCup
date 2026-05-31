<script>
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    import { isPlaceholderTeam } from '../lib/db.js';
    
    // Group matches by group name
    let groupedMatches = $derived.by(() => {
        const groups = {};
        for (const match of matchStore.matches) {
            if (match.stage !== 'GROUP_STAGE' || !match.group) continue;
            
            if (!groups[match.group]) {
                groups[match.group] = {
                    name: match.group,
                    matches: [],
                    teams: new Set()
                };
            }
            groups[match.group].matches.push(match);
            groups[match.group].teams.add(match.team1.name);
            groups[match.group].teams.add(match.team2.name);
        }
        return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
    });

    function isPredictable(match) {
        if (isPlaceholderTeam(match.team1?.name) || isPlaceholderTeam(match.team2?.name)) return false;
        if (match.status !== 'SCHEDULED' && match.status !== 'TIMED') return false;
        if (!match.kickoff) return false;
        const kickoffTime = match.kickoff instanceof Date ? match.kickoff.getTime() : new Date(match.kickoff).getTime();
        return new Date().getTime() < (kickoffTime - 60 * 60 * 1000);
    }
</script>

<div class="groups-page">
    <h1>Groups Stage</h1>
    
    {#if matchStore.error}
        <ErrorMessage error={matchStore.error} context="Groups Stage" />
    {:else if matchStore.loading}
        <p>Loading matches...</p>
    {:else if groupedMatches.length === 0}
        <p>No group stage matches found. Please ask the admin to sync data.</p>
    {:else}
        <div class="groups-grid">
            {#each groupedMatches as group}
                <div class="group-card">
                    <h2>{group.name.replace('_', ' ')}</h2>
                    <ul class="team-list">
                        {#each Array.from(group.teams) as team}
                            <li>{team}</li>
                        {/each}
                    </ul>
                    {#if !predictionStore.loading}
                        {@const predictableMatches = group.matches.filter(isPredictable)}
                        {@const predictedCount = predictableMatches.filter(m => predictionStore.predictions[m.id]).length}
                        {@const totalPredictable = predictableMatches.length}
                        {@const remaining = totalPredictable - predictedCount}
                        <div class="group-progress">
                            {#if totalPredictable > 0}
                                <span class="progress-text {predictedCount === totalPredictable ? 'complete' : ''}">
                                    {predictedCount} / {totalPredictable} predicted
                                    {#if remaining > 0}
                                        <span class="warning-highlight">({remaining} left ⚠️)</span>
                                    {/if}
                                </span>
                                <div class="progress-bar">
                                    <div class="progress-fill" style="width: {(predictedCount / totalPredictable) * 100}%"></div>
                                </div>
                            {:else}
                                <span class="progress-text complete">All matches played</span>
                            {/if}
                        </div>
                    {/if}
                    <a href="#/group/{group.name}" class="view-btn">View Matches & Predict</a>
                </div>
            {/each}
        </div>
    {/if}
</div>

<style>
    .groups-page {
        padding: 2rem;
    }
    .groups-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
    }
    .group-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1.5rem;
        display: flex;
        flex-direction: column;
    }
    h2 {
        color: var(--color-primary);
        font-size: 1.25rem;
        margin-bottom: 1rem;
        text-transform: capitalize;
    }
    .team-list {
        list-style: none;
        padding: 0;
        margin: 0 0 1.5rem 0;
        flex-grow: 1;
    }
    .team-list li {
        padding: 0.25rem 0;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }
    .group-progress {
        margin-bottom: 1.25rem;
    }
    .progress-text {
        display: block;
        font-size: 0.85rem;
        color: #aaa;
        margin-bottom: 0.35rem;
    }
    .progress-text.complete {
        color: var(--color-success);
        font-weight: bold;
    }
    .warning-highlight {
        color: var(--color-accent);
        font-weight: bold;
        margin-left: 0.25rem;
    }
    .progress-bar {
        height: 6px;
        background: rgba(255, 255, 255, 0.1);
        border-radius: 3px;
        overflow: hidden;
    }
    .progress-fill {
        height: 100%;
        background: linear-gradient(90deg, var(--color-primary), var(--color-secondary));
        border-radius: 3px;
        transition: width 0.3s ease;
    }
    .view-btn {
        display: block;
        text-align: center;
        background: rgba(56, 189, 248, 0.1);
        color: var(--color-primary);
        padding: 0.5rem;
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
    }
    .view-btn:hover {
        background: var(--color-primary);
        color: var(--color-bg);
    }
</style>
