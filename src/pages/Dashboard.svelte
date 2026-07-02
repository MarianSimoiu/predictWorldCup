<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import { doc, onSnapshot, query, collection } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    import CommunityPredictions from '../components/CommunityPredictions.svelte';
    import { CHAMPION_LOCK_DEADLINE, CHAMPION_REOPEN_START, CHAMPION_REOPEN_UNTIL } from '../lib/config.js';
    import { isKnockoutStage } from '../lib/scoring.js';

    let userStats = $state({ totalPoints: 0, correctPredictions: 0, correctGoals: 0, winnerPrediction: null, rank: '-' });
    let error = $state(null);

    // Tab state: 'upcoming' | 'predictions'
    let activeTab = $state('upcoming');

    // Reactive clock — 1 s tick drives both lock-status labels and the champion countdown
    let now = $state(new Date());
    $effect(() => {
        const interval = setInterval(() => { now = new Date(); }, 1000);
        return () => clearInterval(interval);
    });

    // Check if there are any finished games with unscored predictions
    let hasUnscoredFinishedGames = $derived.by(() => {
        if (matchStore.loading || predictionStore.loading) return false;
        return matchStore.matches.some(m =>
            m.status === 'FINISHED' &&
            userPredictionsList.some(p => {
                if (p.match.id !== m.id) return false;
                const pred = p.prediction;
                if (isKnockoutStage(m.stage)) {
                    // Only flag complete knockout predictions that haven't been scored yet
                    return pred.predictedAdvancing && pred.predictedGoalsTier && pred.predictedDepartureMethod
                        && pred.advancingCorrect === null;
                }
                return pred.resultCorrect === null || (pred.predictedGoalsTier && pred.goalsCorrect === null);
            })
        );
    });

    let inReopenWindow = $derived(now >= CHAMPION_REOPEN_START && now < CHAMPION_REOPEN_UNTIL);
    let championCountdown = $derived.by(() => {
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

    // Filter and sort states for predictions
    let sortType = $state('date'); // 'date' | 'points_desc' | 'points_asc'
    let filterUpcomingOnly = $state(false);
    let filterJokerEligible = $state(false);
    let filterDoublePoints = $state(false);

    // All Games tab view mode
    let allGamesView = $state('upcoming'); // 'upcoming' | 'finished'

    // All Games tab filters
    let filterAllJoker = $state(false);
    let filterAllDouble = $state(false);

    // Collapsed state per round section (label → bool)
    let collapsedSections = $state({});

    function getRoundLabel(match) {
        if (match.stage === 'GROUP_STAGE') return `Group Stage — Round ${match.matchday}`;
        const labels = {
            ROUND_OF_32: 'Round of 32',
            ROUND_OF_16: 'Round of 16',
            QUARTER_FINALS: 'Quarter Finals',
            SEMI_FINALS: 'Semi Finals',
            THIRD_PLACE: 'Third Place Playoff',
            FINAL: 'Final',
        };
        return labels[match.stage] || match.stage?.replace(/_/g, ' ') || 'Unknown Round';
    }

    function getRoundOrder(match) {
        if (match.stage === 'GROUP_STAGE') return match.matchday || 0;
        const order = { ROUND_OF_32: 4, ROUND_OF_16: 5, QUARTER_FINALS: 6, SEMI_FINALS: 7, THIRD_PLACE: 7.5, FINAL: 8 };
        return order[match.stage] ?? 99;
    }

    let allGamesGrouped = $derived.by(() => {
        if (matchStore.loading) return [];
        let matches = [...matchStore.matches];

        if (allGamesView === 'upcoming') {
            matches = matches.filter(m => m.status !== 'FINISHED');
        } else {
            matches = matches.filter(m => m.status === 'FINISHED').sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
        }

        if (filterAllJoker)    matches = matches.filter(m => m.jokerEligible);
        if (filterAllDouble)   matches = matches.filter(m => m.doublePoints);

        const groups = {};
        for (const m of matches) {
            const label = getRoundLabel(m);
            const order = getRoundOrder(m);
            if (!groups[label]) groups[label] = { label, order, matches: [], allFinished: true };
            groups[label].matches.push(m);
            if (m.status !== 'FINISHED') groups[label].allFinished = false;
        }
        // Sort matches within each group
        for (const g of Object.values(groups)) {
            if (allGamesView === 'upcoming') {
                g.matches.sort((a, b) => new Date(a.kickoff) - new Date(b.kickoff));
            } else {
                g.matches.sort((a, b) => new Date(b.kickoff) - new Date(a.kickoff));
            }
        }
        if (allGamesView === 'finished') {
            // Sort groups by their most recent game, newest first
            return Object.values(groups).sort((a, b) => {
                const latestA = Math.max(...a.matches.map(m => new Date(m.kickoff).getTime()));
                const latestB = Math.max(...b.matches.map(m => new Date(m.kickoff).getTime()));
                return latestB - latestA;
            });
        }
        // Sort sections by earliest kickoff among their remaining matches for true chronological order
        return Object.values(groups).sort((a, b) => {
            const earliestA = Math.min(...a.matches.map(m => new Date(m.kickoff).getTime()));
            const earliestB = Math.min(...b.matches.map(m => new Date(m.kickoff).getTime()));
            return earliestA - earliestB;
        });
    });

    function isSectionCollapsed(label, allFinished) {
        return collapsedSections[label] ?? allFinished;
    }
    function toggleSection(label) {
        collapsedSections[label] = !isSectionCollapsed(label, false);
    }

    // Joker status — which match (if any) has the user played their joker on
    let jokerStatus = $derived.by(() => {
        const jokerPred = Object.values(predictionStore.predictions).find(p => p.isJoker === true);
        if (!jokerPred) return { used: false, matchId: null, matchName: null };
        const m = matchStore.matches.find(m => String(m.id) === String(jokerPred.matchId));
        const matchName = m ? `${m.team1?.name} vs ${m.team2?.name}` : 'Unknown match';
        return { used: true, matchId: jokerPred.matchId, matchName };
    });

    // True if any joker-eligible match exists in the store (round 3 is active)
    let jokerRoundActive = $derived(matchStore.matches.some(m => m.jokerEligible));

    // Live games
    let liveGames = $derived(matchStore.matches.filter(m => m.status === 'LIVE'));
    let hasLiveGames = $derived(liveGames.length > 0);

    // Auto-switch to live tab when games go live; fall back to upcoming when they end
    $effect(() => {
        if (hasLiveGames) {
            activeTab = 'live';
        } else if (activeTab === 'live') {
            activeTab = 'upcoming';
        }
    });

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
    function getLockStatus(match, currentTime) {
        const kickoffTime = new Date(match.kickoff);
        const lockTime = new Date(kickoffTime.getTime() - 60 * 60 * 1000); // 1 hour before

        if (match.status === 'FINISHED') {
            return { status: 'finished', text: 'FINISHED', color: '#888' };
        }

        if (match.status === 'LIVE') {
            return { status: 'live', text: 'LIVE NOW', color: '#ff4444' };
        }

        if (currentTime >= lockTime) {
            return { status: 'locked', text: 'LOCKED', color: '#ff6b6b' };
        }

        // Calculate time remaining until lock
        const diff = lockTime - currentTime;
        const hours = Math.floor(diff / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

        return {
            status: 'unlocked',
            text: `Locks in ${hours}h ${minutes}m`,
            color: '#4ade80'
        };
    }

    // Reactive list of user predictions sorted and filtered dynamically
    let userPredictionsList = $derived.by(() => {
        if (predictionStore.loading || matchStore.loading) return [];
        
        let list = Object.entries(predictionStore.predictions)
            .map(([matchId, prediction]) => {
                const match = matchStore.matches.find(m => String(m.id) === String(matchId));
                return { prediction, match };
            })
            .filter(item => item.match);

        // Filter: Next games only (eliminate finished games)
        if (filterUpcomingOnly) {
            list = list.filter(item => item.match.status !== 'FINISHED');
        }
        if (filterJokerEligible) {
            list = list.filter(item => item.match.jokerEligible === true);
        }
        if (filterDoublePoints) {
            list = list.filter(item => item.match.doublePoints === true);
        }

        // Sort logic
        if (sortType === 'date') {
            // Chronological order: first game of the tournament first (oldest kickoff date first)
            list.sort((a, b) => new Date(a.match.kickoff) - new Date(b.match.kickoff));
        } else if (sortType === 'points_desc') {
            // Sort by points descending (highest first)
            list.sort((a, b) => (b.prediction.pointsAwarded || 0) - (a.prediction.pointsAwarded || 0));
        } else if (sortType === 'points_asc') {
            // Sort by points ascending (lowest first)
            list.sort((a, b) => (a.prediction.pointsAwarded || 0) - (b.prediction.pointsAwarded || 0));
        }

        return list;
    });

    $effect(() => {
        if (!userStore.user) return;

        // Listen to user stats
        const unsubUser = onSnapshot(doc(db, 'users', userStore.user.uid), (docSnap) => {
            if (docSnap.exists()) {
                const data = docSnap.data();
                userStats.totalPoints = data.totalPoints || 0;
                userStats.correctPredictions = data.correctPredictions || 0;
                userStats.correctGoals = data.correctGoals || 0;
                userStats.winnerPrediction = data.winnerPrediction || null;
            }
            error = null;
        }, (err) => {
            console.error("Dashboard stats error:", err);
            error = err.message || String(err);
        });

        // Listen to all users and rank using the same criteria as the Leaderboard:
        // Points DESC → Exact Results DESC → Goals Predictions DESC
        const q = query(collection(db, 'users'));
        const unsubLeaderboard = onSnapshot(q, (snapshot) => {
            const users = [];
            snapshot.forEach((doc) => users.push({ id: doc.id, ...doc.data() }));

            users.sort((a, b) => {
                const ptsDiff = (b.totalPoints || 0) - (a.totalPoints || 0);
                if (ptsDiff !== 0) return ptsDiff;
                const exactDiff = (b.correctPredictions || 0) - (a.correctPredictions || 0);
                if (exactDiff !== 0) return exactDiff;
                return (b.correctGoals || 0) - (a.correctGoals || 0);
            });

            const idx = users.findIndex(u => u.id === userStore.user.uid);
            userStats.rank = idx >= 0 ? idx + 1 : '-';
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
        <div class="stat-card">
            <h3>Goals Predictions</h3>
            <div class="value">{userStats.correctGoals}</div>
        </div>
        <div class="stat-card">
            <h3>Champion Pick</h3>
            <div class="value {userStats.winnerPrediction ? 'value-team' : 'value-empty'}">
                {userStats.winnerPrediction ?? '—'}
            </div>
        </div>
    </div>

    <!-- Joker Card status widget -->
    {#if jokerRoundActive}
        <div class="joker-status-widget {jokerStatus.used ? 'joker-used' : 'joker-available'}" role="button" tabindex="0"
            onclick={() => { activeTab = 'upcoming'; filterAllJoker = true; filterAllDouble = false; allGamesView = 'upcoming'; }}
            onkeydown={(e) => e.key === 'Enter' && (activeTab = 'upcoming', filterAllJoker = true)}>
            <span class="jsw-icon">🃏</span>
            <div class="jsw-text">
                <span class="jsw-title">Joker Card</span>
                {#if jokerStatus.used}
                    <span class="jsw-sub">Played on <strong>{jokerStatus.matchName}</strong></span>
                {:else}
                    <span class="jsw-sub">Available — play it on any eligible round 3 match for 3× points</span>
                {/if}
            </div>
            {#if !jokerStatus.used}
                <span class="jsw-badge">AVAILABLE</span>
            {:else}
                <span class="jsw-badge used">USED</span>
            {/if}
        </div>
    {/if}

    <!-- Champion pick countdown -->
    <div class="champion-countdown {championCountdown ? (championCountdown.reopen ? 'reopen' : '') : 'locked'}">
        <div class="cd-left">
            <span class="cd-trophy">🏆</span>
            <div class="cd-text">
                <span class="cd-title">Champion Pick</span>
                {#if championCountdown}
                    <span class="cd-sub">{championCountdown.reopen ? '⚡ Window closes soon — update your pick!' : 'Locks Wed Jun 18 · 08:00 UTC+2'}</span>
                {:else}
                    <span class="cd-sub locked-sub">Picks are now locked</span>
                {/if}
            </div>
        </div>
        <div class="cd-right">
            {#if championCountdown}
                <div class="cd-units">
                    {#if !championCountdown.reopen && championCountdown.days > 0}
                        <div class="cd-block">
                            <span class="cd-num">{championCountdown.days}</span>
                            <span class="cd-lbl">days</span>
                        </div>
                        <span class="cd-sep">:</span>
                    {/if}
                    <div class="cd-block">
                        <span class="cd-num">{String(championCountdown.hours).padStart(2,'0')}</span>
                        <span class="cd-lbl">hrs</span>
                    </div>
                    <span class="cd-sep">:</span>
                    <div class="cd-block">
                        <span class="cd-num">{String(championCountdown.minutes).padStart(2,'0')}</span>
                        <span class="cd-lbl">min</span>
                    </div>
                    <span class="cd-sep">:</span>
                    <div class="cd-block">
                        <span class="cd-num">{String(championCountdown.seconds).padStart(2,'0')}</span>
                        <span class="cd-lbl">sec</span>
                    </div>
                </div>
            {:else}
                <a href="#/winner" class="cd-locked-link">View your pick →</a>
            {/if}
        </div>
    </div>

    <!-- Tabbed Navigation Bar -->
    <div class="tabs-navigation">
        {#if hasLiveGames}
            <button
                class="tab-btn live-tab-btn"
                class:active={activeTab === 'live'}
                onclick={() => activeTab = 'live'}>
                🔴 Live ({liveGames.length})
            </button>
        {/if}
        <button
            class="tab-btn"
            class:active={activeTab === 'upcoming'}
            onclick={() => activeTab = 'upcoming'}>
            🌍 All Games ({matchStore.loading ? '...' : matchStore.matches.length})
        </button>
        <button
            class="tab-btn"
            class:active={activeTab === 'predictions'}
            onclick={() => activeTab = 'predictions'}>
            🔮 My Predictions ({predictionStore.loading ? '...' : userPredictionsList.length})
        </button>
    </div>

    <!-- Warning Banner for Unscored Games -->
    {#if hasUnscoredFinishedGames}
        <div class="warning-banner">
            <span class="warning-icon">⚠️</span>
            <span class="warning-text">Points not computed yet for some finished games. They will be calculated with the daily sync.</span>
        </div>
    {/if}

    <!-- Tab Contents -->
    {#if activeTab === 'live'}
        <!-- Live Games Section -->
        <div class="live-games-section animate-fade-in">
            <div class="live-section-header">
                <span class="live-dot-pulse"></span>
                <span class="live-section-title">Games in Progress</span>
            </div>
            <div class="live-games-list">
                {#each liveGames as match (match.id)}
                    {@const userPrediction = predictionStore.predictions[match.id]}
                    <div class="live-match-card" class:double-pts={match.doublePoints} class:joker-eligible={match.jokerEligible}>
                        {#if match.doublePoints}
                            <div class="double-pts-banner">⚡ Double Points Match</div>
                        {/if}
                        {#if match.jokerEligible}
                            <div class="joker-eligible-banner">🃏 Joker Eligible{jokerStatus.used && String(jokerStatus.matchId) === String(match.id) ? ' · Your Joker is on this game' : ''}</div>
                        {/if}
                        <div class="live-score-row">
                            <div class="live-team">
                                {#if match.team1?.crest}
                                    <img src={match.team1.crest} alt={match.team1.name} class="team-crest" />
                                {/if}
                                <span class="live-team-name">{match.team1?.name || 'TBD'}</span>
                            </div>
                            <div class="live-score-center">
                                <span class="live-badge-inline">🔴 LIVE</span>
                                <span class="live-score-value">
                                    {match.score?.team1 ?? '–'} : {match.score?.team2 ?? '–'}
                                </span>
                            </div>
                            <div class="live-team live-team-right">
                                <span class="live-team-name">{match.team2?.name || 'TBD'}</span>
                                {#if match.team2?.crest}
                                    <img src={match.team2.crest} alt={match.team2.name} class="team-crest" />
                                {/if}
                            </div>
                        </div>
                        {#if userPrediction}
                            <div class="live-pred-row">
                                <span class="live-pred-label">Your pick:</span>
                                {#if isKnockoutStage(match.stage)}
                                    <strong>
                                        {userPrediction.predictedAdvancing === 'team1' ? (match.team1?.name || 'Team 1') :
                                         userPrediction.predictedAdvancing === 'team2' ? (match.team2?.name || 'Team 2') : '—'} advances
                                    </strong>
                                    {#if userPrediction.predictedGoalsTier}
                                        <span class="live-pred-sep">·</span>
                                        <strong>{userPrediction.predictedGoalsTier} Goals</strong>
                                    {/if}
                                    {#if userPrediction.predictedDepartureMethod}
                                        <span class="live-pred-sep">·</span>
                                        <strong>{userPrediction.predictedDepartureMethod === 'REGULAR' ? '90 min' : userPrediction.predictedDepartureMethod === 'EXTRA_TIME' ? 'ET' : 'Pen'}</strong>
                                    {/if}
                                {:else}
                                    <strong>
                                        {userPrediction.predictedResult === 'team1' ? (match.team1?.name || 'Team 1') :
                                         userPrediction.predictedResult === 'team2' ? (match.team2?.name || 'Team 2') : 'Draw'}
                                    </strong>
                                    {#if userPrediction.predictedGoalsTier}
                                        <span class="live-pred-sep">·</span>
                                        <strong>{userPrediction.predictedGoalsTier} Goals</strong>
                                    {/if}
                                    {#if userPrediction.isJoker}
                                        <span class="live-joker-tag">🃏 JOKER</span>
                                    {/if}
                                {/if}
                            </div>
                        {:else}
                            <div class="live-pred-row live-no-pick">No prediction placed</div>
                        {/if}
                        <CommunityPredictions
                            matchId={match.id}
                            team1Name={match.team1?.name || 'Team 1'}
                            team2Name={match.team2?.name || 'Team 2'}
                            isFinished={false}
                        />
                    </div>
                {/each}
            </div>
        </div>
    {:else if activeTab === 'upcoming'}
        <!-- All Games Section -->
        <div class="all-games-section animate-fade-in">
            {#if matchStore.loading}
                <div class="loading-message">Loading matches...</div>
            {:else if matchStore.error}
                <ErrorMessage error={matchStore.error} context="All Games" />
            {:else}
                <!-- View Toggle & Filters -->
                <div class="all-games-header">
                    <div class="view-toggle">
                        <button class="toggle-btn" class:active={allGamesView === 'upcoming'} onclick={() => allGamesView = 'upcoming'}>📅 Upcoming</button>
                        <button class="toggle-btn" class:active={allGamesView === 'finished'} onclick={() => allGamesView = 'finished'}>✅ Played</button>
                    </div>
                    <div class="all-games-filters">
                        <label class="checkbox-container joker-filter" class:active={filterAllJoker}>
                            <input type="checkbox" bind:checked={filterAllJoker} />
                            <span class="checkmark checkmark-joker"></span>
                            🃏 Joker eligible
                        </label>
                        <label class="checkbox-container double-filter" class:active={filterAllDouble}>
                            <input type="checkbox" bind:checked={filterAllDouble} />
                            <span class="checkmark checkmark-double"></span>
                            ⚡ Double points
                        </label>
                    </div>
                </div>

                {#if allGamesGrouped.length === 0}
                    <div class="no-matches">No matches match the selected filters.</div>
                {:else}
                    {#each allGamesGrouped as group (group.label)}
                        {@const collapsed = isSectionCollapsed(group.label, allGamesView === 'upcoming' && group.allFinished)}
                        {@const finishedCount = group.matches.filter(m => m.status === 'FINISHED').length}
                        <div class="round-section">
                            <button class="round-header" class:all-done={group.allFinished} onclick={() => toggleSection(group.label)}>
                                <div class="round-header-left">
                                    <span class="round-label">{group.label}</span>
                                    <span class="round-meta">{group.matches.length} matches · {finishedCount} played</span>
                                </div>
                                <span class="round-chevron">{collapsed ? '▶' : '▼'}</span>
                            </button>

                            {#if !collapsed}
                                <div class="matches-list">
                                    {#each group.matches as match (match.id)}
                                        {@const lockStatus = getLockStatus(match, now)}
                                        {@const formattedTime = formatBucharestDateTime(new Date(match.kickoff))}
                                        {@const userPrediction = predictionStore.predictions[match.id]}
                                        <div class="match-card" class:locked={lockStatus.status === 'locked'} class:live={lockStatus.status === 'live'} class:finished={match.status === 'FINISHED'} class:double-pts={match.doublePoints} class:joker-eligible={match.jokerEligible}>
                                            {#if match.doublePoints}
                                                <div class="double-pts-banner">⚡ Double Points Match</div>
                                            {/if}
                                            {#if match.jokerEligible}
                                                <div class="joker-eligible-banner">🃏 Joker Eligible{jokerStatus.used && String(jokerStatus.matchId) === String(match.id) ? ' · Your Joker is on this game' : !jokerStatus.used ? ' · You can play your Joker here' : ''}</div>
                                            {/if}
                                            <div class="match-main-row">
                                            <div class="match-teams">
                                                <div class="team team-1">
                                                    {#if match.team1?.crest}
                                                        <img src={match.team1.crest} alt={match.team1.name} class="team-crest" />
                                                    {/if}
                                                    <span class="team-name">{match.team1?.name || 'TBD'}</span>
                                                </div>
                                                <div class="vs">{#if match.status === 'FINISHED' && match.score?.team1 !== null && match.score?.team2 !== null}<span class="final-score">{match.score.team1} – {match.score.team2}</span>{:else}VS{/if}</div>
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
                                                            {#if isKnockoutStage(match.stage)}
                                                                {#if !userPrediction.predictedAdvancing || !userPrediction.predictedGoalsTier || !userPrediction.predictedDepartureMethod}
                                                                    <div class="pred-row pred-incomplete">⚠️ Incomplete trio</div>
                                                                {:else}
                                                                    <div class="pred-row">
                                                                        <span class="pred-label">Advances:</span>
                                                                        <strong class="pred-val">
                                                                            {userPrediction.predictedAdvancing === 'team1' ? match.team1?.name || 'Team 1' : match.team2?.name || 'Team 2'}
                                                                        </strong>
                                                                    </div>
                                                                    <div class="pred-row">
                                                                        <span class="pred-label">Goals:</span>
                                                                        <strong class="pred-val">{userPrediction.predictedGoalsTier} Goals</strong>
                                                                    </div>
                                                                    <div class="pred-row">
                                                                        <span class="pred-label">Ends:</span>
                                                                        <strong class="pred-val">
                                                                            {userPrediction.predictedDepartureMethod === 'REGULAR' ? '90 min' : userPrediction.predictedDepartureMethod === 'EXTRA_TIME' ? 'Extra Time' : 'Penalties'}
                                                                        </strong>
                                                                    </div>
                                                                {/if}
                                                            {:else}
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
                                                            {/if}
                                                        </div>
                                                    {:else}
                                                        <span class="no-prediction">No prediction yet</span>
                                                    {/if}
                                                </div>
                                                {#if lockStatus.status === 'unlocked'}
                                                    <a href="#/match/{match.id}" class="action-button">
                                                        {userPrediction ? 'Edit' : 'Predict'}
                                                    </a>
                                                {:else}
                                                    <div class="locked-predictions-indicator">
                                                        <div class="lock-status-badge">
                                                            <span class="lock-icon">🔒</span>
                                                            <span class="lock-text">Locked</span>
                                                        </div>
                                                        {#if userPrediction && match.status === 'FINISHED'}
                                                            {@const isPending = isKnockoutStage(match.stage)
                                                                ? (userPrediction.predictedAdvancing && userPrediction.predictedDepartureMethod && userPrediction.advancingCorrect === null)
                                                                : userPrediction.resultCorrect === null}
                                                            {#if isPending}
                                                                <div class="points-earned-badge pts-0">⏳ pending</div>
                                                            {:else if !isKnockoutStage(match.stage) || userPrediction.predictedAdvancing}
                                                                <div class="points-earned-badge" class:pts-6={userPrediction.pointsAwarded >= 6} class:pts-3={userPrediction.pointsAwarded > 0 && userPrediction.pointsAwarded < 6} class:pts-0={userPrediction.pointsAwarded === 0}>
                                                                    +{userPrediction.pointsAwarded} pts{match.doublePoints && !isKnockoutStage(match.stage) ? ' ⚡' : ''}
                                                                </div>
                                                            {/if}
                                                        {/if}
                                                    </div>
                                                {/if}
                                            </div>
                                            </div><!-- end match-main-row -->

                                            {#if lockStatus.status === 'locked' || match.status === 'LIVE' || match.status === 'FINISHED'}
                                                <CommunityPredictions
                                                    matchId={match.id}
                                                    team1Name={match.team1?.name || 'Team 1'}
                                                    team2Name={match.team2?.name || 'Team 2'}
                                                    isFinished={match.status === 'FINISHED'}
                                                />
                                            {/if}
                                        </div>
                                    {/each}
                                </div>
                            {/if}
                        </div>
                    {/each}
                {/if}
            {/if}
        </div>
    {:else}
        <!-- My Predictions Section -->
        <div class="predictions-section animate-fade-in">
            {#if predictionStore.loading || matchStore.loading}
                <div class="loading-message">Loading predictions...</div>
            {:else}
                <!-- Controls: Sort & Filter -->
                <div class="controls-bar">
                    <div class="filters-group">
                        <label class="checkbox-container">
                            <input type="checkbox" bind:checked={filterUpcomingOnly} />
                            <span class="checkmark"></span>
                            Next games only
                        </label>
                        <label class="checkbox-container joker-filter" class:active={filterJokerEligible}>
                            <input type="checkbox" bind:checked={filterJokerEligible} />
                            <span class="checkmark checkmark-joker"></span>
                            🃏 Joker eligible
                        </label>
                        <label class="checkbox-container double-filter" class:active={filterDoublePoints}>
                            <input type="checkbox" bind:checked={filterDoublePoints} />
                            <span class="checkmark checkmark-double"></span>
                            ⚡ Double points
                        </label>
                    </div>

                    <div class="sort-control">
                        <span class="sort-label">Sort by:</span>
                        <select bind:value={sortType} class="sort-select">
                            <option value="date">📅 Match Date (Chronological)</option>
                            <option value="points_desc">📈 Points (High to Low)</option>
                            <option value="points_asc">📉 Points (Low to High)</option>
                        </select>
                    </div>
                </div>

                {#if userPredictionsList.length === 0}
                    <div class="no-predictions">
                        <p>No predictions match the selected filter.</p>
                        <a href="#/groups" class="predict-now-btn">Start Predicting</a>
                    </div>
                {:else}
                    <div class="predictions-history-list">
                        {#each userPredictionsList as item (item.prediction.id)}
                            {@const match = item.match}
                            {@const pred = item.prediction}
                            {@const formattedTime = formatBucharestDateTime(new Date(match.kickoff))}
                            <div class="prediction-history-card" class:card-finished={match.status === 'FINISHED'} class:card-live={match.status === 'LIVE'} class:card-double={match.doublePoints}>

                                <!-- Header: Stage & Time -->
                                <div class="card-header">
                                    <span class="stage-tag">{match.stage.replace(/_/g, ' ')}</span>
                                    {#if match.doublePoints}<span class="double-pts-tag">⚡ 2x</span>{/if}
                                    {#if pred.isJoker}
                                        <span class="joker-tag">🃏 Joker</span>
                                    {:else if match.jokerEligible && match.status !== 'FINISHED'}
                                        <span class="joker-eligible-tag">🃏 Eligible</span>
                                    {/if}
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
                                        {#if isKnockoutStage(match.stage)}
                                            {#if !pred.predictedAdvancing && !pred.predictedDepartureMethod}
                                                <div class="bet-item incomplete-bet">⚠️ Incomplete — re-predict using the new Knockout Trio format</div>
                                            {:else}
                                                <div class="bet-item">
                                                    <span class="bet-label">Advances:</span>
                                                    <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.advancingCorrect === true} class:incorrect={match.status === 'FINISHED' && pred.advancingCorrect === false}>
                                                        {pred.predictedAdvancing === 'team1' ? match.team1?.name : pred.predictedAdvancing === 'team2' ? match.team2?.name : '—'}
                                                        {#if match.status === 'FINISHED' && pred.predictedAdvancing}
                                                            {pred.advancingCorrect === true ? '✅' : pred.advancingCorrect === false ? '❌' : '⏳'}
                                                        {/if}
                                                    </span>
                                                </div>
                                                <div class="bet-item">
                                                    <span class="bet-label">Goals (90 min):</span>
                                                    <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.goalsCorrect === true} class:incorrect={match.status === 'FINISHED' && pred.goalsCorrect === false}>
                                                        {pred.predictedGoalsTier ? `${pred.predictedGoalsTier} Goals` : '—'}
                                                        {#if match.status === 'FINISHED' && pred.predictedGoalsTier}
                                                            {pred.goalsCorrect === true ? '✅' : pred.goalsCorrect === false ? '❌' : '⏳'}
                                                        {/if}
                                                    </span>
                                                </div>
                                                <div class="bet-item">
                                                    <span class="bet-label">Ends via:</span>
                                                    <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.departureCorrect === true} class:incorrect={match.status === 'FINISHED' && pred.departureCorrect === false}>
                                                        {pred.predictedDepartureMethod === 'REGULAR' ? '90 min' : pred.predictedDepartureMethod === 'EXTRA_TIME' ? 'Extra Time' : pred.predictedDepartureMethod === 'PENALTY_SHOOTOUT' ? 'Penalties' : '—'}
                                                        {#if match.status === 'FINISHED' && pred.predictedDepartureMethod}
                                                            {pred.departureCorrect === true ? '✅' : pred.departureCorrect === false ? '❌' : '⏳'}
                                                        {/if}
                                                    </span>
                                                </div>
                                            {/if}
                                        {:else}
                                            <div class="bet-item">
                                                <span class="bet-label">Winner Choice:</span>
                                                <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.resultCorrect === true} class:incorrect={match.status === 'FINISHED' && pred.resultCorrect === false}>
                                                    {pred.predictedResult === 'team1' ? match.team1?.name :
                                                     pred.predictedResult === 'team2' ? match.team2?.name :
                                                     'Draw'}
                                                    {#if match.status === 'FINISHED'}
                                                        {pred.resultCorrect === true ? '✅' : pred.resultCorrect === false ? '❌' : '⏳'}
                                                    {/if}
                                                </span>
                                            </div>
                                            <div class="bet-item">
                                                <span class="bet-label">Goals Choice:</span>
                                                <span class="bet-value" class:correct={match.status === 'FINISHED' && pred.goalsCorrect === true} class:incorrect={match.status === 'FINISHED' && pred.goalsCorrect === false}>
                                                    {pred.predictedGoalsTier ? `${pred.predictedGoalsTier} Goals` : 'None'}
                                                    {#if match.status === 'FINISHED' && pred.predictedGoalsTier}
                                                        {pred.goalsCorrect === true ? '✅' : pred.goalsCorrect === false ? '❌' : '⏳'}
                                                    {/if}
                                                </span>
                                            </div>
                                        {/if}
                                    </div>

                                    <div class="points-summary">
                                        {#if match.status === 'FINISHED'}
                                            {#if isKnockoutStage(match.stage)}
                                                {#if pred.predictedAdvancing && pred.predictedDepartureMethod && pred.advancingCorrect === null}
                                                    <div class="points-display pts-pending">
                                                        <span class="pts-val">⏳</span>
                                                        <span class="pts-lbl">points pending</span>
                                                    </div>
                                                {:else if pred.predictedAdvancing}
                                                    <div class="points-display" class:pts-perfect={pred.pointsAwarded >= 6} class:pts-partial={pred.pointsAwarded > 0 && pred.pointsAwarded < 6} class:pts-zero={pred.pointsAwarded === 0}>
                                                        <span class="pts-val">+{pred.pointsAwarded}</span>
                                                        <span class="pts-lbl">pts</span>
                                                    </div>
                                                {/if}
                                            {:else if pred.resultCorrect === null || (pred.predictedGoalsTier && pred.goalsCorrect === null)}
                                                <div class="points-display pts-pending">
                                                    <span class="pts-val">⏳</span>
                                                    <span class="pts-lbl">points pending</span>
                                                </div>
                                            {:else}
                                                <div class="points-display" class:pts-perfect={pred.pointsAwarded >= 6} class:pts-partial={pred.pointsAwarded > 0 && pred.pointsAwarded < 6} class:pts-zero={pred.pointsAwarded === 0}>
                                                    <span class="pts-val">+{pred.pointsAwarded}</span>
                                                    <span class="pts-lbl">pts</span>
                                                </div>
                                            {/if}
                                        {:else if match.status === 'LIVE'}
                                            <div class="status-badge live">LIVE</div>
                                        {:else}
                                            {@const lockStatus = getLockStatus(match, now)}
                                            {#if lockStatus.status === 'unlocked'}
                                                <a href="#/match/{match.id}" class="action-button edit-btn">Edit</a>
                                            {:else}
                                                <div class="status-badge pending">LOCKED 🔒</div>
                                            {/if}
                                        {/if}
                                    </div>
                                </div>

                            </div>
                        {/each}
                    </div>
                {/if}
            {/if}
        </div>
    {/if}
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
        margin-bottom: 2.5rem;
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
    .value.value-team {
        font-size: clamp(1rem, 3vw, 1.4rem);
        color: var(--color-accent);
        text-shadow: none;
        line-height: 1.3;
        word-break: break-word;
    }
    .value.value-empty {
        color: #555;
        text-shadow: none;
    }

    /* Champion countdown widget */
    .champion-countdown {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        background: rgba(251, 191, 36, 0.07);
        border: 1px solid rgba(251, 191, 36, 0.25);
        border-radius: 12px;
        padding: 0.9rem 1.25rem;
        margin-bottom: 2rem;
        flex-wrap: wrap;
    }
    .champion-countdown.locked {
        background: rgba(255, 255, 255, 0.03);
        border-color: rgba(255, 255, 255, 0.08);
    }
    .champion-countdown.reopen {
        background: rgba(245, 158, 11, 0.08);
        border-color: rgba(245, 158, 11, 0.3);
        animation: pulse-border 2s infinite;
    }
    @keyframes pulse-border {
        0%, 100% { border-color: rgba(245, 158, 11, 0.3); }
        50%       { border-color: rgba(245, 158, 11, 0.7); }
    }
    .cd-left {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }
    .cd-trophy { font-size: 1.5rem; flex-shrink: 0; }
    .cd-text {
        display: flex;
        flex-direction: column;
        gap: 0.1rem;
    }
    .cd-title {
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--color-accent);
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }
    .cd-sub {
        font-size: 0.75rem;
        color: #888;
    }
    .cd-sub.locked-sub { color: #666; font-style: italic; }

    .cd-right { display: flex; align-items: center; }
    .cd-units {
        display: flex;
        align-items: center;
        gap: 0.25rem;
    }
    .cd-block {
        display: flex;
        flex-direction: column;
        align-items: center;
        min-width: 2.5rem;
    }
    .cd-num {
        font-size: clamp(1.3rem, 4vw, 1.7rem);
        font-weight: 800;
        color: var(--color-accent);
        font-variant-numeric: tabular-nums;
        line-height: 1;
    }
    .cd-lbl {
        font-size: 0.6rem;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.05em;
    }
    .cd-sep {
        font-size: 1.4rem;
        font-weight: 700;
        color: #444;
        padding-bottom: 0.9rem;
        flex-shrink: 0;
    }
    .cd-locked-link {
        color: #888;
        font-size: 0.85rem;
        text-decoration: none;
        padding: 0.35rem 0.75rem;
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 6px;
        transition: all 0.2s;
    }
    .cd-locked-link:hover {
        color: #fff;
        border-color: rgba(255,255,255,0.2);
    }

    @media (max-width: 480px) {
        .champion-countdown {
            flex-direction: column;
            align-items: flex-start;
            gap: 0.75rem;
        }
        .cd-right { width: 100%; justify-content: center; }
    }

    /* Tabbed Navigation */
    .tabs-navigation {
        display: flex;
        gap: 0.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        margin-bottom: 2rem;
    }

    .tab-btn {
        background: transparent;
        border: none;
        color: #888;
        padding: 0.75rem 1.5rem;
        font-size: 1.1rem;
        font-weight: 600;
        cursor: pointer;
        transition: all 0.2s ease;
        position: relative;
        border-bottom: 3px solid transparent;
        margin-bottom: -2px;
    }

    .tab-btn:hover {
        color: #fff;
    }

    .tab-btn.active {
        color: var(--color-primary);
        border-bottom-color: var(--color-primary);
        text-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
    }

    .live-tab-btn {
        color: #ef4444;
        animation: live-tab-pulse 1.8s ease-in-out infinite;
    }
    .live-tab-btn.active {
        color: #ef4444;
        border-bottom-color: #ef4444;
        text-shadow: 0 0 10px rgba(239, 68, 68, 0.4);
    }
    @keyframes live-tab-pulse {
        0%, 100% { opacity: 1; }
        50% { opacity: 0.65; }
    }

    /* Live Games Section */
    .live-games-section { padding: 0; }
    .live-section-header {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        margin-bottom: 1.25rem;
        font-size: 1.05rem;
        font-weight: 700;
        color: #ef4444;
    }
    .live-dot-pulse {
        width: 12px;
        height: 12px;
        border-radius: 50%;
        background: #ef4444;
        display: inline-block;
        box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.7);
        animation: dot-pulse 1.5s ease-out infinite;
        flex-shrink: 0;
    }
    @keyframes dot-pulse {
        0%   { box-shadow: 0 0 0 0 rgba(239,68,68,0.7); }
        70%  { box-shadow: 0 0 0 10px rgba(239,68,68,0); }
        100% { box-shadow: 0 0 0 0 rgba(239,68,68,0); }
    }
    .live-section-title { letter-spacing: 0.03em; }
    .live-games-list { display: flex; flex-direction: column; gap: 1rem; }
    .live-match-card {
        background: rgba(239, 68, 68, 0.06);
        border: 1px solid rgba(239, 68, 68, 0.3);
        border-radius: 12px;
        overflow: hidden;
        padding: 1.25rem;
    }
    .live-score-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 0.85rem;
    }
    .live-team {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        flex: 1;
    }
    .live-team-right { justify-content: flex-end; text-align: right; }
    .live-team-name {
        font-size: 1rem;
        font-weight: 700;
        color: #fff;
    }
    .live-score-center {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 0.3rem;
        flex-shrink: 0;
    }
    .live-badge-inline {
        font-size: 0.7rem;
        font-weight: 800;
        color: #ef4444;
        letter-spacing: 0.08em;
        text-transform: uppercase;
    }
    .live-score-value {
        font-size: 1.6rem;
        font-weight: 800;
        color: #fff;
        letter-spacing: 0.05em;
    }
    .live-pred-row {
        display: flex;
        align-items: center;
        gap: 0.5rem;
        font-size: 0.85rem;
        color: #ccc;
        padding-top: 0.75rem;
        border-top: 1px solid rgba(255,255,255,0.07);
    }
    .live-pred-row strong { color: #fff; }
    .live-pred-label { color: #888; }
    .live-pred-sep { color: #555; }
    .live-no-pick { color: #666; font-style: italic; }
    .live-joker-tag {
        background: rgba(139, 92, 246, 0.2);
        color: #a78bfa;
        border: 1px solid rgba(139, 92, 246, 0.35);
        border-radius: 4px;
        padding: 0.1rem 0.4rem;
        font-size: 0.75rem;
        font-weight: 700;
        margin-left: 0.25rem;
    }

    /* Tab contents animation */
    .animate-fade-in {
        animation: fadeIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
    }

    @keyframes fadeIn {
        from { opacity: 0; transform: translateY(8px); }
        to { opacity: 1; transform: translateY(0); }
    }

    /* Controls Bar (Sort & Filter) */
    .controls-bar {
        display: flex;
        justify-content: space-between;
        align-items: center;
        background: rgba(255, 255, 255, 0.02);
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        padding: 1rem;
        margin-bottom: 1.5rem;
        gap: 1.5rem;
        flex-wrap: wrap;
    }
    .filters-group {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
    }
    .checkbox-container.joker-filter.active { color: #a78bfa; }
    .checkbox-container.double-filter.active { color: var(--color-accent); }
    .checkmark-joker { border-color: rgba(139,92,246,0.5) !important; }
    .checkbox-container.joker-filter input:checked ~ .checkmark-joker { background: #7c3aed !important; border-color: #7c3aed !important; }
    .checkmark-double { border-color: rgba(245,158,11,0.5) !important; }
    .checkbox-container.double-filter input:checked ~ .checkmark-double { background: var(--color-accent) !important; border-color: var(--color-accent) !important; }

    /* Custom Checkbox */
    .checkbox-container {
        display: flex;
        align-items: center;
        position: relative;
        padding-left: 2rem;
        cursor: pointer;
        font-size: 0.95rem;
        color: #ccc;
        user-select: none;
        height: 1.5rem;
    }

    .checkbox-container input {
        position: absolute;
        opacity: 0;
        cursor: pointer;
        height: 0;
        width: 0;
    }

    .checkmark {
        position: absolute;
        top: 0.125rem;
        left: 0;
        height: 1.25rem;
        width: 1.25rem;
        background-color: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.2);
        border-radius: 4px;
        transition: all 0.2s ease;
    }

    .checkbox-container:hover input ~ .checkmark {
        border-color: var(--color-primary);
        background-color: rgba(255, 255, 255, 0.1);
    }

    .checkbox-container input:checked ~ .checkmark {
        background-color: var(--color-primary);
        border-color: var(--color-primary);
    }

    .checkmark:after {
        content: "";
        position: absolute;
        display: none;
    }

    .checkbox-container input:checked ~ .checkmark:after {
        display: block;
    }

    .checkbox-container .checkmark:after {
        left: 7px;
        top: 3px;
        width: 4px;
        height: 8px;
        border: solid #0f172a;
        border-width: 0 2px 2px 0;
        transform: rotate(45deg);
    }

    /* Custom Select */
    .sort-control {
        display: flex;
        align-items: center;
        gap: 0.75rem;
    }

    .sort-label {
        font-size: 0.95rem;
        color: #888;
        font-weight: 500;
    }

    .sort-select {
        background: rgba(0, 0, 0, 0.3);
        border: 1px solid rgba(255, 255, 255, 0.15);
        color: #fff;
        padding: 0.5rem 1rem;
        border-radius: 6px;
        font-size: 0.9rem;
        cursor: pointer;
        outline: none;
        transition: all 0.2s ease;
    }

    .sort-select:hover {
        border-color: var(--color-primary);
        background: rgba(255, 255, 255, 0.05);
    }

    .sort-select option {
        background: #0f172a;
        color: #fff;
    }

    /* All Games + Predictions Sections */
    .all-games-section, .predictions-section {
        margin-bottom: 2rem;
    }

    /* All Games header */
    .all-games-header {
        display: flex;
        gap: 1.5rem;
        align-items: center;
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
    }

    /* View toggle */
    .view-toggle {
        display: flex;
        gap: 0.25rem;
        background: rgba(255,255,255,0.03);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 8px;
        padding: 0.25rem;
    }
    .toggle-btn {
        padding: 0.4rem 0.9rem;
        border: none;
        background: transparent;
        color: #888;
        cursor: pointer;
        font-size: 0.85rem;
        font-weight: 600;
        border-radius: 6px;
        transition: all 0.15s;
    }
    .toggle-btn:hover { color: #aaa; }
    .toggle-btn.active {
        background: rgba(255,255,255,0.1);
        color: white;
        border: 1px solid rgba(255,255,255,0.15);
    }

    /* Filters bar for All Games */
    .all-games-filters {
        display: flex;
        flex-wrap: wrap;
        gap: 1rem;
        align-items: center;
    }

    /* Round section */
    .round-section {
        margin-bottom: 0.75rem;
        border-radius: 10px;
        overflow: hidden;
        border: 1px solid rgba(255,255,255,0.07);
    }
    .round-header {
        width: 100%;
        display: flex;
        align-items: center;
        justify-content: space-between;
        background: rgba(255,255,255,0.04);
        border: none;
        padding: 0.75rem 1rem;
        cursor: pointer;
        color: white;
        text-align: left;
        transition: background 0.15s;
        gap: 1rem;
    }
    .round-header:hover { background: rgba(255,255,255,0.07); }
    .round-header.all-done { background: rgba(255,255,255,0.02); }
    .round-header.all-done .round-label { color: #666; }
    .round-header-left { display: flex; flex-direction: column; gap: 0.15rem; }
    .round-label {
        font-size: 0.95rem;
        font-weight: 700;
        color: var(--color-primary);
    }
    .round-meta {
        font-size: 0.72rem;
        color: #666;
    }
    .round-chevron {
        font-size: 0.65rem;
        color: #555;
        flex-shrink: 0;
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
        flex-direction: column;
        gap: 0;
        transition: all 0.2s ease;
        overflow: hidden;
    }

    .match-main-row {
        display: flex;
        align-items: center;
        gap: 1.5rem;
        width: 100%;
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
    .match-card.double-pts {
        border-color: rgba(245, 158, 11, 0.4);
        background: rgba(245, 158, 11, 0.04);
    }
    .double-pts-banner {
        background: linear-gradient(90deg, rgba(245,158,11,0.15), transparent);
        border-bottom: 1px solid rgba(245,158,11,0.2);
        color: var(--color-accent);
        font-size: 0.75rem;
        font-weight: 700;
        padding: 0.35rem 1.25rem;
        margin: -1.25rem -1.25rem 1rem -1.25rem;
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .double-pts-tag {
        background: rgba(245,158,11,0.15);
        color: var(--color-accent);
        font-size: 0.7rem;
        font-weight: 800;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        border: 1px solid rgba(245,158,11,0.3);
        letter-spacing: 0.03em;
    }
    .joker-tag {
        background: rgba(139,92,246,0.15);
        color: #a78bfa;
        font-size: 0.7rem;
        font-weight: 800;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        border: 1px solid rgba(139,92,246,0.3);
        letter-spacing: 0.03em;
    }
    .joker-eligible-tag {
        background: rgba(139,92,246,0.08);
        color: #a78bfa;
        font-size: 0.7rem;
        font-weight: 600;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        border: 1px dashed rgba(139,92,246,0.35);
        letter-spacing: 0.03em;
    }

    /* Joker eligible banner on upcoming match card */
    .match-card.joker-eligible { border-color: rgba(139,92,246,0.3); }
    .joker-eligible-banner {
        background: linear-gradient(90deg, rgba(139,92,246,0.12), transparent);
        border-bottom: 1px solid rgba(139,92,246,0.2);
        color: #a78bfa;
        font-size: 0.72rem;
        font-weight: 600;
        padding: 0.3rem 1.25rem;
        margin: -1.25rem -1.25rem 1rem -1.25rem;
        letter-spacing: 0.03em;
    }

    /* Joker status widget */
    .joker-status-widget { cursor: pointer; }
    .joker-status-widget:hover { border-color: rgba(139,92,246,0.5); background: rgba(139,92,246,0.1); }
    .joker-status-widget {
        display: flex;
        align-items: center;
        gap: 0.75rem;
        padding: 0.75rem 1.25rem;
        border-radius: 10px;
        border: 1px solid rgba(139,92,246,0.25);
        background: rgba(139,92,246,0.06);
        margin-bottom: 1.25rem;
        flex-wrap: wrap;
    }
    .joker-status-widget.joker-used {
        border-color: rgba(139,92,246,0.15);
        background: rgba(139,92,246,0.03);
        opacity: 0.8;
    }
    .jsw-icon { font-size: 1.5rem; }
    .jsw-text { flex: 1; min-width: 0; }
    .jsw-title {
        display: block;
        font-size: 0.85rem;
        font-weight: 700;
        color: #a78bfa;
    }
    .jsw-sub {
        display: block;
        font-size: 0.75rem;
        color: #888;
        margin-top: 0.1rem;
    }
    .jsw-sub strong { color: #c4b5fd; }
    .jsw-badge {
        font-size: 0.68rem;
        font-weight: 800;
        padding: 0.2rem 0.6rem;
        border-radius: 20px;
        background: rgba(139,92,246,0.2);
        color: #a78bfa;
        border: 1px solid rgba(139,92,246,0.4);
        letter-spacing: 0.05em;
        white-space: nowrap;
        animation: pulse-joker 2s infinite;
    }
    .jsw-badge.used {
        background: rgba(100,100,100,0.15);
        color: #666;
        border-color: rgba(100,100,100,0.2);
        animation: none;
    }
    @keyframes pulse-joker {
        0%, 100% { opacity: 0.7; }
        50%       { opacity: 1; }
    }
    .card-double {
        border-left: 3px solid var(--color-accent);
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
    .final-score {
        font-size: 1.1rem;
        font-weight: 800;
        color: #fff;
        letter-spacing: 0.04em;
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
    .edit-btn {
        font-size: 0.85rem;
        padding: 0.4rem 1rem;
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

    /* Community stats bar on finished match cards */
    .community-bar {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.3rem 0.6rem;
        font-size: 0.8rem;
        color: #888;
        background: rgba(255,255,255,0.02);
        border-top: 1px solid rgba(255,255,255,0.05);
        padding: 0.5rem 1.25rem;
        margin: 0 -1.25rem -1.25rem;
        border-radius: 0 0 12px 12px;
    }
    .cb-icon { flex-shrink: 0; }
    .cb-text strong { color: #ccc; }
    .cb-pct { color: #666; }
    .cb-sep { color: #444; }
    .cb-dist {
        display: flex;
        gap: 0.25rem;
        margin-left: auto;
    }
    .dist-pill {
        background: rgba(255,255,255,0.05);
        border-radius: 4px;
        padding: 0.1rem 0.3rem;
        font-size: 0.72rem;
        color: #777;
    }

    /* Predictions List */
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

    .incomplete-bet {
        font-size: 0.8rem;
        color: #fb923c;
        font-style: italic;
    }

    .pred-incomplete {
        font-size: 0.75rem;
        color: #fb923c;
        font-style: italic;
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

    .pts-pending {
        background: rgba(255,255,255,0.04);
        color: #666;
        border: 1px solid rgba(255,255,255,0.08);
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

    .warning-banner {
        background: rgba(251, 191, 36, 0.1);
        border: 1px solid rgba(251, 191, 36, 0.3);
        color: #fbbf24;
        padding: 1rem;
        margin: 1rem 0;
        border-radius: 8px;
        display: flex;
        align-items: center;
        gap: 0.75rem;
        font-size: 0.95rem;
    }

    .warning-icon {
        font-size: 1.25rem;
        flex-shrink: 0;
    }

    .warning-text {
        flex: 1;
    }

    /* Responsive Design */
    @media (max-width: 1100px) {
        .match-main-row {
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

        .double-pts-banner, .joker-eligible-banner {
            margin-left: -1rem;
            margin-right: -1rem;
            margin-top: -1rem;
            padding-left: 1rem;
            padding-right: 1rem;
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

        .tabs-navigation {
            gap: 0.25rem;
        }

        .tab-btn {
            font-size: 0.95rem;
            padding: 0.5rem 0.75rem;
        }

        .controls-bar {
            flex-direction: column;
            align-items: stretch;
            gap: 1rem;
            padding: 0.75rem;
        }

        .sort-control {
            justify-content: space-between;
        }

        .sort-select {
            width: 70%;
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

        .tab-btn {
            font-size: 0.85rem;
            padding: 0.5rem 0.5rem;
            flex: 1;
            text-align: center;
        }

        .sort-select {
            width: 100%;
        }

        .sort-control {
            flex-direction: column;
            align-items: stretch;
            gap: 0.35rem;
        }
    }
</style>
