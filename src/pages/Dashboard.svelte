<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import { doc, onSnapshot, query, collection, orderBy } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';

    let userStats = $state({ totalPoints: 0, correctPredictions: 0, rank: '-' });
    let error = $state(null);

    // Helper function to format time for Bucharest timezone
    function formatTimeWithBucharest(date) {
        const utcTime = date.toLocaleString('en-US', {
            timeZone: 'UTC',
            year: 'numeric',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit'
        });

        const bucharestTime = date.toLocaleString('en-US', {
            timeZone: 'Europe/Bucharest',
            hour: '2-digit',
            minute: '2-digit'
        });

        return { utcTime, bucharestTime };
    }

    // Helper function to calculate lock status
    function getLockStatus(match) {
        const now = new Date();
        const lockTime = new Date(match.kickoff.getTime() - 60 * 60 * 1000); // 1 hour before

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

    // Get next 8 upcoming matches
    function getUpcomingMatches() {
        const now = new Date();
        return matchStore.matches
            .filter(match => {
                const kickoff = new Date(match.kickoff);
                return match.status !== 'FINISHED' || kickoff > new Date(now.getTime() - 24 * 60 * 60 * 1000);
            })
            .slice(0, 8);
    }

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
    <p>Welcome, {userStore.user?.displayName || userStore.user?.email}!</p>
    
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
                    {@const { utcTime, bucharestTime } = formatTimeWithBucharest(new Date(match.kickoff))}
                    {@const userPrediction = predictionStore.predictions[match.id]}
                    <div class="match-card" class:locked={lockStatus.status === 'locked'} class:live={lockStatus.status === 'live'}>
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
                                <div class="time-row">
                                    <span class="label">UTC:</span>
                                    <span class="time">{utcTime}</span>
                                </div>
                                <div class="time-row">
                                    <span class="label">Bucharest:</span>
                                    <span class="time bucharest">{bucharestTime}</span>
                                </div>
                            </div>

                            <div class="lock-status" style="color: {lockStatus.color}">
                                {lockStatus.text}
                            </div>

                            <div class="prediction-info">
                                {#if userPrediction}
                                    <span class="your-prediction">
                                        Your bet: <strong>
                                            {userPrediction.predictedResult === 'team1' ? match.team1?.name || 'Team 1' : 
                                             userPrediction.predictedResult === 'team2' ? match.team2?.name || 'Team 2' : 
                                             'Draw'}
                                        </strong>
                                    </span>
                                {:else}
                                    <span class="no-prediction">No prediction yet</span>
                                {/if}
                            </div>

                            <a href="#/match/{match.id}" class="action-button">
                                {userPrediction ? 'Edit' : 'Predict'}
                            </a>
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
    }

    .stats-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
        gap: 1.5rem;
        margin-top: 2rem;
    }

    .stat-card {
        background: rgba(255, 255, 255, 0.05);
        padding: 1.5rem;
        border-radius: 12px;
        border: 1px solid rgba(255, 255, 255, 0.1);
        text-align: center;
    }

    .stat-card h3 {
        margin: 0;
        color: #888;
        font-size: 1rem;
    }

    .value {
        font-size: 2.5rem;
        font-weight: bold;
        color: var(--color-primary);
        margin-top: 0.5rem;
    }

    /* Upcoming Matches Section */
    .upcoming-section {
        margin-top: 3rem;
        padding-top: 2rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
    }

    .upcoming-section h2 {
        margin: 0 0 1.5rem 0;
        color: #fff;
        font-size: 1.5rem;
    }

    .loading-message,
    .no-matches {
        text-align: center;
        color: #888;
        padding: 2rem;
        font-size: 1rem;
    }

    .matches-list {
        display: flex;
        flex-direction: column;
        gap: 1rem;
    }

    .match-card {
        background: rgba(255, 255, 255, 0.03);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 10px;
        padding: 1.25rem;
        display: flex;
        gap: 1.5rem;
        align-items: stretch;
        transition: all 0.2s ease;
    }

    .match-card:hover {
        background: rgba(255, 255, 255, 0.06);
        border-color: rgba(255, 255, 255, 0.2);
    }

    .match-card.locked {
        opacity: 0.7;
        background: rgba(255, 107, 107, 0.05);
        border-color: rgba(255, 107, 107, 0.2);
    }

    .match-card.live {
        background: rgba(255, 68, 68, 0.1);
        border-color: rgba(255, 68, 68, 0.3);
    }

    .match-teams {
        display: flex;
        align-items: center;
        gap: 1rem;
        min-width: 300px;
    }

    .team {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
    }

    .team-1 {
        justify-content: flex-end;
    }

    .team-2 {
        justify-content: flex-start;
    }

    .team-crest {
        width: 32px;
        height: 32px;
        object-fit: contain;
    }

    .team-name {
        font-size: 0.95rem;
        font-weight: 500;
        color: #fff;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 120px;
    }

    .vs {
        color: #666;
        font-size: 0.85rem;
        font-weight: bold;
        margin: 0 0.5rem;
        white-space: nowrap;
    }

    .match-details {
        flex: 1;
        display: flex;
        align-items: center;
        gap: 1.5rem;
        min-width: 600px;
    }

    .time-info {
        display: flex;
        flex-direction: column;
        gap: 0.25rem;
        min-width: 140px;
    }

    .time-row {
        display: flex;
        gap: 0.5rem;
        font-size: 0.9rem;
    }

    .time-row .label {
        color: #888;
        font-weight: 500;
        min-width: 70px;
    }

    .time-row .time {
        color: #ddd;
        font-weight: 500;
    }

    .time-row .bucharest {
        color: var(--color-primary);
        font-weight: 600;
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
        gap: 0.5rem;
    }

    .your-prediction {
        font-size: 0.9rem;
        color: #aaa;
    }

    .your-prediction strong {
        color: var(--color-primary);
        font-weight: 600;
    }

    .no-prediction {
        font-size: 0.9rem;
        color: #666;
        font-style: italic;
    }

    .action-button {
        padding: 0.5rem 1rem;
        background: var(--color-primary);
        color: #000;
        border: none;
        border-radius: 6px;
        font-size: 0.9rem;
        font-weight: 600;
        text-decoration: none;
        cursor: pointer;
        transition: all 0.2s ease;
        white-space: nowrap;
        text-align: center;
    }

    .action-button:hover {
        opacity: 0.85;
        transform: translateY(-2px);
    }

    /* Responsive Design */
    @media (max-width: 1200px) {
        .match-card {
            flex-direction: column;
            gap: 1rem;
        }

        .match-details {
            flex-direction: column;
            gap: 0.75rem;
            min-width: auto;
            width: 100%;
        }

        .match-teams {
            min-width: auto;
            width: 100%;
        }

        .time-info {
            width: 100%;
            flex-direction: row;
            gap: 1rem;
        }

        .time-row {
            flex: 1;
        }

        .lock-status {
            min-width: auto;
        }

        .action-button {
            width: 100%;
        }
    }

    @media (max-width: 768px) {
        .match-card {
            padding: 1rem;
            gap: 0.75rem;
        }

        .match-teams {
            gap: 0.5rem;
        }

        .team-crest {
            width: 28px;
            height: 28px;
        }

        .team-name {
            max-width: 80px;
            font-size: 0.85rem;
        }

        .vs {
            font-size: 0.75rem;
        }

        .time-row {
            font-size: 0.8rem;
        }

        .lock-status {
            font-size: 0.85rem;
        }

        .prediction-info {
            font-size: 0.85rem;
        }
    }
</style>
