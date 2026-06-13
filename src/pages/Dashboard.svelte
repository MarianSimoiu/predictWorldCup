<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import { doc, onSnapshot, query, collection, orderBy } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let userStats = $state({ totalPoints: 0, correctPredictions: 0, rank: '-' });
    let error = $state(null);

    // Format time and date for Bucharest timezone (Europe/Bucharest)
    function formatBucharestDateTime(date) {
        if (!(date instanceof Date) || isNaN(date)) return '';
        return date.toLocaleString('en-US', {
            timeZone: 'Europe/Bucharest',
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false
        }) + ' (UTC+2)';
    }

    // Helper function to calculate lock status
    function getLockStatus(match) {
        const now = new Date();
        const kickoffTime = new Date(match.kickoff);
        const lockTime = new Date(kickoffTime.getTime() - 60 * 60 * 1000); // 1 hour before

        if (match.status === 'FINISHED') {
            return { status: 'finished', text: 'FINISHED', color: '#888' };
        }

        if (match.status === 'LIVE') {
            return { status: 'live', text: 'LIVE NOW', color: '#ff4444' };
        }

        if (now >= lockTime) {
            return { status: 'locked', text: 'LOCKED', color: '#ff6b6b' };
        }

        // Calculate time remaining until lock
        const diff = lockTime - now;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return {
            status: 'unlocked',
            text: `Locks in ${hours}h ${minutes}m`,
            color: '#4ade80'
        };
    }

    // Get next 8 upcoming matches (or recently finished within 24h)
    function getUpcomingMatches() {
        const now = new Date();
        return matchStore.matches
            .filter(match => {
                const kickoff = new Date(match.kickoff);
                return match.status !== 'FINISHED' || kickoff > new Date(now.getTime() - 24 * 60 * 60 * 1000);
            })
            .slice(0, 8);
    }

    // Reactive list of user predictions sorted by kickoff date (newest first)
    let userPredictionsList = $derived.by(() => {
        if (predictionStore.loading || matchStore.loading) return [];
        return Object.entries(predictionStore.predictions)
            .map(([matchId, prediction]) => {
                const match = matchStore.matches.find(m => String(m.id) === String(matchId));
                return { prediction, match };
            })
            .filter(item => item.match)
            .sort((a, b) => new Date(b.match.kickoff) - new Date(a.match.kickoff));
    });

    $effect(() => {
        if (!userStore.user) return;

        // Listen to user stats
        const unsubUser = onSnapshot(doc(db, 'users', userStore.user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                userStats.totalPoints = data.totalPoints || 0;
                userStats.correctPredictions = data.correctPredictions || 0;
            }
            error = null;
        }, (err) => {
            console.error("Dashboard stats error:", err);
            error = err.message || String(err);
        });

        // Listen to leaderboard to find rank
        const q = query(collection(db, 'users'), orderBy('totalPoints', 'desc'));
        const unsubLeaderboard = onSnapshot(q, (snapshot) => {
            let rank = 1;
            let found = false;
            snapshot.forEach((doc) => {
                if (doc.id === userStore.user.uid) {
                    userStats.rank = rank;
                    found = true;
                }
                rank++;
            });
            if (!found) userStats.rank = '-';
            error = null;
        }, (err) => {
            console.error("Dashboard leaderboard rank error:", err);
            error = err.message || String(err);
        });

        return () => {
            unsubUser();
            unsubLeaderboard();
        };
    });
</script>

<div class="dashboard">
    <h1>Dashboard</h1>
    <p class="welcome-text">Welcome, {userStore.user?.displayName || userStore.user?.email}!</p>
    
    {#if error}
        <ErrorMessage error={error} context="Dashboard" />
    {/if}
    
    <div class="stats-grid">
        <div class="stat-card">
            <h3>Total Points</h3>
            <div class="value">{userStats.totalPoints}</div>
        </div>
        <div class="stat-card">
            <h3>Rank</h3>
            <div class="value">{userStats.rank}</div>
        </div>
        <div class="stat-card">
            <h3>Exact Results</h3>
            <div class="value">{userStats.correctPredictions}</div>
        </div>
    </div>

    <!-- Upcoming Matches Section -->
    <div class="upcoming-section">
        <h2>📅 Upcoming Matches</h2>
        
        {#if matchStore.loading}
            <div class="loading-message">Loading matches...</div>
        {:else if matchStore.error}
            <ErrorMessage error={matchStore.error} context="Upcoming Matches" />
        {:else if getUpcomingMatches().length === 0}
            <div class="no-matches">No upcoming matches</div>
        {:else}
            <div class="matches-list">
                {#each getUpcomingMatches() as match (match.id)}
                    {@const lockStatus = getLockStatus(match)}
                    {@const formattedTime = formatBucharestDateTime(new Date(match.kickoff))}
                    {@const userPrediction = predictionStore.predictions[match.id]}
                    <div class="match-card" class:locked={lockStatus.status === 'locked'} class:live={lockStatus.status === 'live'} class:finished={match.status === 'FINISHED'}>
                        <div class="match-teams">
                            <div class="team team-1">
                                {#if match.team1?.crest}
                                    <img src={match.team1.crest} alt={match.team1.name} class="team-crest" />
                                {/if}
                                <span class="team-name">{match.team1?.name || 'TBD'}</span>
                            </div>
                            <div class="vs">VS</div>
                            <div class="team team-2">
                                <span class="team-name">{match.team2?.name || 'TBD'}</span>
                                {#if match.team2?.crest}
                                    <img src={match.team2.crest} alt={match.team2.name} class="team-crest" />
                                {/if}
                            </div>
                        </div>

                        <div class="match-details">
                            <div class="time-info">
                                <span class="time bucharest">🕒 {formattedTime}</span>
                            </div>

                            <div class="lock-status" style="color: {lockStatus.color}">
                                {lockStatus.text}
                            </div>

                            <div class="prediction-info">
                                {#if userPrediction}
                                    <div class="predictions-summary">
                                        <div class="pred-row">
                                            <span class="pred-label">Winner:</span>
                                            <strong class="pred-val">
                                                {userPrediction.predictedResult === 'team1' ? match.team1?.name || 'Team 1' : 
                                                 userPrediction.predictedResult === 'team2' ? match.team2?.name || 'Team 2' : 
                                                 'Draw'}
                                            </strong>
                                        </div>
                                        <div class="pred-row">
                                            <span class="pred-label">Goals:</span>
                                            <strong class="pred-val">
                                                {userPrediction.predictedGoalsTier ? `${userPrediction.predictedGoalsTier} Goals` : 'None'}
                                            </strong>
                                        </div>
                                    </div>
                                {:else}
                                    <span class="no-prediction">No prediction yet</span>
                                {/if}
                            </div>

                            {#if match.status !== 'FINISHED'}
                                <a href="#/match/{match.id}" class="action-button">
                                    {userPrediction ? 'Edit' : 'Predict'}
                                </a>
                            {:else}
                                <div class="locked-predictions-indicator">
                                    <div class="lock-status-badge">
                                        <span class="lock-icon">🔒</span>
                                        <span class="lock-text">Locked</span>
                                    </div>
                                    {#if userPrediction}
                                        <div class="points-earned-badge" class:pts-6={userPrediction.pointsAwarded === 6} class:pts-3={userPrediction.pointsAwarded === 3} class:pts-0={userPrediction.pointsAwarded === 0}>
                                            +{userPrediction.pointsAwarded} pts
                                        </div>
                                    {/if}
                                </div>
                            {/if}
                        </div>
                    </div>
                {/each}
            </div>
        {/if}
    </div>

    <!-- My Predictions Section -->
    <div class="predictions-section">
        <h2>🔮 My Predictions</h2>
        
        {#if predictionStore.loading || matchStore.loading}
            <div class="loading-message">Loading predictions...</div>
        {:else if userPredictionsList.length === 0}
            <div class="no-predictions">
                <p>You haven't made any predictions yet.</p>
                <a href="#/groups" class="predict-now-btn">Start Predicting</a>
            </div>
        {:else}
            <div class="predictions-history-list">
                {#each userPredictionsList as item (item.prediction.id)}
                    {@const match = item.match}
                    {@const pred = item.prediction}
                    {@const formattedTime = formatBucharestDateTime(new Date(match.kickoff))}
                    <div class="prediction-history-card" class:card-finished={match.status === 'FINISHED'} class:card-live={match.status === 'LIVE'}>
                        
                        <!-- Header: Stage & Time -->
                        <div class="card-header">
                            <span class="stage-tag">{match.stage.replace(/_/g, ' ')}</span>
                            <span class="match-time">🕒 {formattedTime}</span>
                        </div>

                        <!-- Teams & Score -->
                        <div class="card-main">
                            <div class="history-team home">
                                {#if match.team1?.crest}
                                    <img src={match.team1.crest} alt={match.team1.name} class="team-flag" />
                                {/if}
                                <span class="team-name">{match.team1?.name}</span>
                            </div>

                            <div class="history-score">
                                {#if match.status === 'FINISHED' || match.status === 'LIVE'}
                                    <span class="score-text">{match.score?.team1} - {match.score?.team2}</span>
                                    {#if match.status === 'LIVE'}
                                        <span class="live-tag">LIVE</span>
                                    {/if}
                                {:else}
                                    <span class="vs-text">VS</span>
                                {/if}
                            </div>

                            <div class="history-team away">
                                <span class="team-name">{match.team2?.name}</span>
                                {#if match.team2?.crest}
                                    <img src={match.team2.crest} alt={match.team2.name} class="team-flag" />
                                {/if}
                            </div>
                        </div>

                        <!-- Bets & Points -->
                        <div class="card-footer">
                            <div class="bets-summary">
                                <div class="bet-item">
                                    <span class="bet-label">Winner Choice:</span>
                                    <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.resultCorrect} class:incorrect={match.status === 'FINISHED' && pred.resultCorrect === false}>
                                        {pred.predictedResult === 'team1' ? match.team1?.name : 
                                         pred.predictedResult === 'team2' ? match.team2?.name : 
                                         'Draw'}
                                        {#if match.status === 'FINISHED'}
                                            {pred.resultCorrect ? '✅' : '❌'}
                                        {/if}
                                    </span>
                                </div>
                                <div class="bet-item">
                                    <span class="bet-label">Goals Choice:</span>
                                    <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.goalsCorrect} class:incorrect={match.status === 'FINISHED' && pred.goalsCorrect === false}>
                                        {pred.predictedGoalsTier ? `${pred.predictedGoalsTier} Goals` : 'None'}
                                        {#if match.status === 'FINISHED' && pred.predictedGoalsTier}
                                            {pred.goalsCorrect ? '✅' : '❌'}
                                        {/if}
                                    </span>
                                </div>
                            </div>

                            <div class="points-summary">
                                {#if match.status === 'FINISHED'}
                                    <div class="points-display" class:pts-perfect={pred.pointsAwarded === 6} class:pts-partial={pred.pointsAwarded === 3} class:pts-zero={pred.pointsAwarded === 0}>
                                        <span class="pts-val">+{pred.pointsAwarded}</span>
                                        <span class="pts-lbl">pts</span>
                                    </div>
                                {:else if match.status === 'LIVE'}
                                    <div class="status-badge live">LIVE</div>
                                {:else}
                                    <div class="status-badge pending">PENDING</div>
                                {/if}
                            </div>
                        </div>

                    </div>
                {/each}
            </div>
        {/if}
    </div>
</div>

<style>
    .dashboard {
        padding: 2rem;
        max-width: 1200px;
        margin: 0 auto;
    }

    .welcome-text {
        color: #aaa;
        font-size: 1.1rem;
        margin-top: -0.5rem;
        margin-bottom: 2rem;
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-bottom: 3rem;
    }

    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
        transition: transform 0.2s ease, border-color 0.2s ease;
    }

    .stat-card:hover {
        transform: translateY(-2px);
        border-color: var(--color-primary);
    }

    .stat-card h3 {
        margin: 0;
        color: #aaa;
        font-size: 1rem;
        text-transform: uppercase;
        letter-spacing: 1px;
    }

    .value {
        font-size: 2.5rem;
        font-weight: bold;
        color: var(--color-primary);
        margin-top: 0.5rem;
        text-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
    }

    /* Upcoming Matches Section */
    .upcoming-section {
        margin-bottom: 4rem;
        padding-top: 2rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .upcoming-section h2, .predictions-section h2 {
        margin: 0 0 1.5rem 0;
        color: #fff;
        font-size: 1.75rem;
        font-weight: 700;
    }

    .loading-message,
    .no-matches,
    .no-predictions {
        text-align: center;
        color: #888;
        padding: 3rem 2rem;
        font-size: 1.1rem;
        background: rgba(255, 255, 255, 0.02);
        border-radius: 12px;
        border: 1px dashed rgba(255, 255, 255, 0.1);
    }

    .matches-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .match-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: 1.25rem;
        display: flex;
        gap: 1.5rem;
        align-items: center;
        transition: all 0.2s ease;
    }

    .match-card:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .match-card.locked {
        background: rgba(255, 107, 107, 0.02);
        border-color: rgba(255, 107, 107, 0.15);
    }

    .match-card.live {
        background: rgba(255, 68, 68, 0.05);
        border-color: rgba(255, 68, 68, 0.25);
    }

    .match-card.finished {
        opacity: 0.85;
        background: rgba(255, 255, 255, 0.01);
        border-color: rgba(255, 255, 255, 0.05);
    }

    .match-teams {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 320px;
    }

    .team {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
    }

    .team-1 {
        justify-content: flex-end;
        text-align: right;
    }

    .team-2 {
        justify-content: flex-start;
        text-align: left;
    }

    .team-crest {
        width: 36px;
        height: 24px;
        object-fit: cover;
        border-radius: 4px;
        box-shadow: 0 2px 4px rgba(0, 0, 0, 0.25);
    }

    .team-name {
        font-size: 1rem;
        font-weight: 600;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    .vs {
        color: #666;
        font-size: 0.85rem;
        font-weight: 800;
        margin: 0 0.5rem;
        white-space: nowrap;
        background: rgba(255, 255, 255, 0.05);
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
    }

    .match-details {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 1.5rem;
        justify-content: space-between;
    }

    .time-info {
        min-width: 170px;
    }

    .time-info .bucharest {
        color: var(--color-primary);
        font-weight: 600;
        font-size: 0.95rem;
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }

    .lock-status {
        font-size: 0.9rem;
        font-weight: 600;
        white-space: nowrap;
        min-width: 120px;
    }

    .prediction-info {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 180px;
    }

    .predictions-summary {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        background: rgba(0, 0, 0, 0.15);
        padding: 0.5rem 0.75rem;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.05);
    }

    .pred-row {
        display: flex;
        justify-content: space-between;
        font-size: 0.85rem;
        gap: 1rem;
    }

    .pred-label {
        color: #888;
    }

    .pred-val {
        color: var(--color-accent);
        font-weight: 600;
        text-align: right;
    }

    .no-prediction {
        font-size: 0.9rem;
        color: #666;
        font-style: italic;
    }

    .action-button {
        padding: 0.5rem 1.25rem;
        background: var(--color-primary);
        color: #0f172a;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 700;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
        text-align: center;
        box-shadow: 0 4px 10px rgba(56, 189, 248, 0.25);
    }

    .action-button:hover {
        opacity: 0.9;
        transform: translateY(-2px);
        box-shadow: 0 6px 15px rgba(56, 189, 248, 0.35);
    }

    .locked-predictions-indicator {
        display: flex;
        flex-direction: column;
        align-items: flex-end;
        gap: 0.5rem;
        min-width: 100px;
    }

    .lock-status-badge {
        display: flex;
        align-items: center;
        gap: 0.35rem;
        background: rgba(255, 255, 255, 0.05);
        padding: 0.35rem 0.75rem;
        border-radius: 6px;
        border: 1px solid rgba(255, 255, 255, 0.08);
        color: #888;
        font-size: 0.85rem;
        font-weight: 600;
    }

    .points-earned-badge {
        font-size: 0.8rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
        text-align: center;
        width: 100%;
    }

    .points-earned-badge.pts-6 {
        background: rgba(16, 185, 129, 0.15);
        color: var(--color-success);
        border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .points-earned-badge.pts-3 {
        background: rgba(251, 191, 36, 0.15);
        color: var(--color-accent);
        border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .points-earned-badge.pts-0 {
        background: rgba(239, 68, 68, 0.1);
        color: var(--color-danger);
        border: 1px solid rgba(239, 68, 68, 0.2);
    }

    /* Predictions Section */
    .predictions-section {
        padding-top: 2rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 3rem;
    }

    .predict-now-btn {
        display: inline-block;
        margin-top: 1rem;
        padding: 0.6rem 1.5rem;
        background: var(--color-accent);
        color: #0f172a;
        font-weight: 700;
        border-radius: 6px;
        transition: all 0.2s ease;
    }

    .predict-now-btn:hover {
        opacity: 0.9;
        transform: translateY(-2px);
    }

    .predictions-history-list {
        display: grid;
        grid-template-columns: 1fr;
        gap: 1.25rem;
    }

    .prediction-history-card {
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 12px;
        padding: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 1rem;
        position: relative;
        overflow: hidden;
        transition: all 0.2s ease;
    }

    .prediction-history-card:hover {
        background: rgba(255, 255, 255, 0.04);
        border-color: rgba(255, 255, 255, 0.15);
    }

    .prediction-history-card.card-finished {
        border-left: 4px solid #475569;
    }

    .prediction-history-card.card-live {
        border-left: 4px solid var(--color-danger);
        background: rgba(239, 68, 68, 0.02);
    }

    .card-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 0.85rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.05);
        padding-bottom: 0.5rem;
    }

    .stage-tag {
        color: #888;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .match-time {
        color: #aaa;
    }

    .card-main {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 0.25rem 0;
    }

    .history-team {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        flex: 1;
        max-width: 40%;
    }

    .history-team.home {
        justify-content: flex-end;
        text-align: right;
    }

    .history-team.away {
        justify-content: flex-start;
        text-align: left;
    }

    .team-flag {
        width: 32px;
        height: 20px;
        object-fit: cover;
        border-radius: 3px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.3);
    }

    .history-score {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.25rem;
        min-width: 80px;
    }

    .score-text {
        font-size: 1.5rem;
        font-weight: 800;
        color: #fff;
        letter-spacing: 1px;
    }

    .live-tag {
        background: var(--color-danger);
        color: #fff;
        font-size: 0.7rem;
        font-weight: 800;
        padding: 0.1rem 0.4rem;
        border-radius: 4px;
        animation: pulse 1.5s infinite;
    }

    .vs-text {
        font-size: 0.9rem;
        font-weight: 800;
        color: #444;
        background: rgba(255, 255, 255, 0.02);
        padding: 0.2rem 0.5rem;
        border-radius: 4px;
    }

    .card-footer {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(0, 0, 0, 0.15);
        padding: 0.75rem 1rem;
        border-radius: 8px;
        border: 1px solid rgba(255, 255, 255, 0.03);
    }

    .bets-summary {
        display: flex;
        gap: 2rem;
    }

    .bet-item {
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
    }

    .bet-label {
        font-size: 0.75rem;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }

    .bet-value {
        font-size: 0.95rem;
        font-weight: 600;
        color: var(--color-accent);
    }

    .bet-value.correct {
        color: var(--color-success);
    }

    .bet-value.incorrect {
        color: #94a3b8;
    }

    .points-summary {
        display: flex;
        align-items: center;
    }

    .points-display {
        display: flex;
        align-items: baseline;
        gap: 0.1rem;
        padding: 0.25rem 0.75rem;
        border-radius: 6px;
        font-weight: 800;
    }

    .pts-perfect {
        background: rgba(16, 185, 129, 0.15);
        color: var(--color-success);
        border: 1px solid rgba(16, 185, 129, 0.3);
    }

    .pts-partial {
        background: rgba(251, 191, 36, 0.15);
        color: var(--color-accent);
        border: 1px solid rgba(251, 191, 36, 0.3);
    }

    .pts-zero {
        background: rgba(239, 68, 68, 0.1);
        color: #94a3b8;
        border: 1px solid rgba(239, 68, 68, 0.15);
    }

    .pts-val {
        font-size: 1.25rem;
    }

    .pts-lbl {
        font-size: 0.75rem;
        text-transform: uppercase;
        font-weight: 600;
    }

    .status-badge {
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.3rem 0.75rem;
        border-radius: 6px;
        letter-spacing: 0.5px;
    }

    .status-badge.pending {
        background: rgba(255, 255, 255, 0.05);
        color: #888;
        border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .status-badge.live {
        background: rgba(239, 68, 68, 0.15);
        color: var(--color-danger);
        border: 1px solid rgba(239, 68, 68, 0.3);
        animation: pulse 1.5s infinite;
    }

    @keyframes pulse {
        0% { opacity: 1; }
        50% { opacity: 0.6; }
        100% { opacity: 1; }
    }

    /* Responsive Design */
    @media (max-width: 1100px) {
        .match-card {
            flex-direction: column;
            gap: 1.25rem;
            align-items: stretch;
        }

        .match-teams {
            min-width: auto;
            width: 100%;
            justify-content: center;
        }

        .match-details {
            flex-direction: row;
            gap: 1rem;
            width: 100%;
            flex-wrap: wrap;
        }

        .time-info, .lock-status, .prediction-info, .locked-predictions-indicator, .action-button {
            flex: 1;
            min-width: 140px;
        }

        .action-button {
            width: auto;
        }
        
        .locked-predictions-indicator {
            align-items: flex-start;
        }
    }

    @media (max-width: 768px) {
        .dashboard {
            padding: 1rem;
        }

        .stats-grid {
            gap: 1rem;
            margin-bottom: 2rem;
        }

        .stat-card {
            padding: 1rem;
        }

        .value {
            font-size: 2rem;
        }

        .match-card {
            padding: 1rem;
        }

        .team-name {
            font-size: 0.9rem;
            max-width: 90px;
        }

        .team-crest {
            width: 28px;
            height: 18px;
        }

        .time-info, .lock-status, .prediction-info, .locked-predictions-indicator, .action-button {
            min-width: calc(50% - 0.5rem);
        }

        .card-main {
            flex-direction: row;
        }

        .history-team .team-name {
            max-width: 70px;
        }

        .score-text {
            font-size: 1.25rem;
        }

        .card-footer {
            flex-direction: column;
            align-items: stretch;
            gap: 0.75rem;
        }

        .bets-summary {
            justify-content: space-between;
            gap: 1rem;
        }

        .points-summary {
            justify-content: flex-end;
        }
    }

    @media (max-width: 480px) {
        .time-info, .lock-status, .prediction-info, .locked-predictions-indicator, .action-button {
            min-width: 100%;
        }

        .bets-summary {
            flex-direction: column;
            gap: 0.5rem;
        }
    }
</style>
