<script>
    import { matchStore, userStore, predictionStore } from '../lib/stores.svelte.js';
    import PredictionCard from '../components/PredictionCard.svelte';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    
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
</script>

<div class="match-detail">
    <a href="#/groups" class="back-link">← Back to Groups</a>
    
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
        padding: 2rem;
        max-width: 800px;
        margin: 0 auto;
    }
    .back-link {
        color: var(--color-secondary);
        text-decoration: none;
        display: inline-block;
        margin-bottom: 2rem;
    }
    .back-link:hover { text-decoration: underline; }
    
    .scoreboard {
        background: linear-gradient(180deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.02) 100%);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 16px;
        padding: 2rem;
        text-align: center;
        box-shadow: 0 10px 30px rgba(0,0,0,0.3);
    }
    
    .meta {
        display: flex;
        justify-content: center;
        gap: 1.5rem;
        font-size: 0.9rem;
        color: #aaa;
        margin-bottom: 2rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }
    .status.live { color: var(--color-danger); font-weight: bold; animation: pulse 2s infinite; }
    .status.finished { color: var(--color-success); }
    
    .teams-container {
        display: flex;
        align-items: center;
        justify-content: space-between;
    }
    .team {
        flex: 1;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 1rem;
    }
    .big-flag {
        width: 100px;
        height: 70px;
        object-fit: cover;
        border-radius: 8px;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
    }
    .team-name {
        margin: 0;
        font-size: 1.5rem;
    }
    
    .score {
        padding: 0 2rem;
    }
    .vs {
        font-size: 2rem;
        font-weight: bold;
        color: #555;
    }
    .score-numbers {
        font-size: 3.5rem;
        font-weight: 800;
        color: var(--color-primary);
        text-shadow: 0 2px 10px rgba(56, 189, 248, 0.3);
    }
    
    .loading, .error {
        text-align: center;
        padding: 3rem;
        font-size: 1.2rem;
    }
    .error {
        color: var(--color-danger);
    }
    
    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.5; }
        100% { opacity: 1; }
    }
</style>
