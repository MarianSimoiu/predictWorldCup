<script>
    import { matchStore, predictionStore } from '../lib/stores.svelte.js';
    import ErrorMessage from '../components/ErrorMessage.svelte';
    import { isPlaceholderTeam } from '../lib/db.js';

    let groupedMatches = $derived.by(() => {
        const groups = {};
        for (const match of matchStore.matches) {
            if (match.stage !== 'GROUP_STAGE' || !match.group) continue;
            if (!groups[match.group]) {
                groups[match.group] = { name: match.group, matches: [], teams: new Set() };
            }
            groups[match.group].matches.push(match);
            groups[match.group].teams.add(match.team1.name);
            groups[match.group].teams.add(match.team2.name);
        }
        return Object.values(groups).sort((a, b) => a.name.localeCompare(b.name));
    });

    function isReal(match) {
        return !isPlaceholderTeam(match.team1?.name) && !isPlaceholderTeam(match.team2?.name);
    }

    function isPredictable(match) {
        if (!isReal(match)) return false;
        if (match.status !== 'SCHEDULED' && match.status !== 'TIMED') return false;
        if (!match.kickoff) return false;
        const kickoffTime = match.kickoff instanceof Date ? match.kickoff.getTime() : new Date(match.kickoff).getTime();
        return Date.now() < kickoffTime - 60 * 60 * 1000;
    }

    function groupStats(group) {
        const realMatches = group.matches.filter(isReal);
        const finished = realMatches.filter(m => m.status === 'FINISHED');
        const predictions = predictionStore.predictions;

        const totalMatches = realMatches.length;
        const finishedCount = finished.length;
        const openCount = group.matches.filter(isPredictable).length;
        const gamesRemaining = realMatches.filter(m => m.status !== 'FINISHED').length;

        let pointsEarned = 0;
        let predictedFinishedCount = 0;
        let resultsCorrect = 0;
        let resultsPredicted = 0;
        let goalsCorrect = 0;
        let goalsPredicted = 0;
        let isScored = false;

        // One entry per finished match — drives the dot rows
        const dots = finished.map(m => {
            const p = predictions[m.id];
            if (!p) return { result: 'none', goals: 'none' };

            predictedFinishedCount++;
            pointsEarned += p.pointsAwarded || 0;

            let result = 'pending';
            let goals = 'none';

            if (p.resultCorrect !== null) {
                isScored = true;
                resultsPredicted++;
                result = p.resultCorrect ? 'correct' : 'wrong';
                if (p.resultCorrect) resultsCorrect++;
            }

            if (p.goalsCorrect !== null) {
                goalsPredicted++;
                goals = p.goalsCorrect ? 'correct' : 'wrong';
                if (p.goalsCorrect) goalsCorrect++;
            } else if (p.predictedGoalsTier) {
                goals = 'pending';
            }

            return { result, goals };
        });

        return {
            totalMatches,
            finishedCount,
            openCount,
            gamesRemaining,
            pointsEarned,
            maxPossibleEarned: predictedFinishedCount * 6,
            resultsCorrect,
            resultsPredicted,
            goalsCorrect,
            goalsPredicted,
            isScored,
            maxPtsAvailable: openCount * 6,
            dots
        };
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
                {@const stats = predictionStore.loading ? null : groupStats(group)}
                <div class="group-card">

                    <div class="card-header">
                        <h2>{group.name.replace('_', ' ')}</h2>
                        {#if stats}
                            <span class="played-badge">{stats.finishedCount}/{stats.totalMatches} played</span>
                        {/if}
                    </div>

                    <ul class="team-list">
                        {#each Array.from(group.teams) as team}
                            <li>{team}</li>
                        {/each}
                    </ul>

                    {#if stats}
                        <div class="zones">

                            <!-- PLAYED ZONE -->
                            <div class="zone zone-played">
                                <span class="zone-label">Played</span>

                                {#if stats.finishedCount === 0}
                                    <p class="zone-empty">No games played yet</p>
                                {:else}
                                    <div class="pts-row">
                                        <span class="pts-earned">{stats.pointsEarned}</span>
                                        <span class="pts-sep">/</span>
                                        <span class="pts-max">{stats.maxPossibleEarned} pts</span>
                                    </div>

                                    {#if stats.isScored}
                                        <div class="accuracy-block">
                                            <div class="accuracy-row">
                                                <span class="acc-label">Result</span>
                                                <div class="dots">
                                                    {#each stats.dots as dot}
                                                        <span class="dot dot-{dot.result}" title={dot.result}></span>
                                                    {/each}
                                                </div>
                                                <span class="acc-count">{stats.resultsCorrect}/{stats.resultsPredicted}</span>
                                            </div>
                                            <div class="accuracy-row">
                                                <span class="acc-label">Goals</span>
                                                <div class="dots">
                                                    {#each stats.dots as dot}
                                                        <span class="dot dot-{dot.goals}" title={dot.goals}></span>
                                                    {/each}
                                                </div>
                                                <span class="acc-count">{stats.goalsCorrect}/{stats.goalsPredicted}</span>
                                            </div>
                                        </div>
                                    {:else}
                                        <p class="zone-pending">Scoring pending</p>
                                    {/if}
                                {/if}
                            </div>

                            <!-- OPEN ZONE -->
                            <div class="zone zone-open {stats.openCount > 0 ? 'has-open' : ''}">
                                <span class="zone-label">Open</span>

                                {#if stats.openCount > 0}
                                    <div class="open-count">{stats.openCount}</div>
                                    <div class="open-sub">game{stats.openCount !== 1 ? 's' : ''} to predict</div>
                                    <div class="open-pts">
                                        up to <strong>{stats.maxPtsAvailable}</strong> pts
                                    </div>
                                {:else if stats.gamesRemaining > 0}
                                    <div class="locked-icon">⏳</div>
                                    <div class="open-sub">{stats.gamesRemaining} game{stats.gamesRemaining !== 1 ? 's' : ''} upcoming</div>
                                    <div class="open-sub muted">Predictions locked</div>
                                {:else}
                                    <div class="locked-icon">✓</div>
                                    <div class="open-sub">All games played</div>
                                {/if}
                            </div>

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
        padding: clamp(1rem, 3vw, 2rem);
        width: 100%;
    }
    h1 {
        font-size: clamp(1.5rem, 5vw, 2.5rem);
        margin: 0 0 clamp(1rem, 3vw, 2rem);
    }
    .groups-grid {
        display: grid;
        grid-template-columns: repeat(auto-fill, minmax(clamp(260px, 40vw, 300px), 1fr));
        gap: clamp(1rem, 2vw, 1.5rem);
    }
    .group-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        padding: clamp(1rem, 2vw, 1.25rem);
        display: flex;
        flex-direction: column;
        gap: clamp(0.75rem, 2vw, 1rem);
    }

    /* Header */
    .card-header {
        display: flex;
        align-items: baseline;
        justify-content: space-between;
        gap: 0.5rem;
    }
    h2 {
        color: var(--color-primary);
        font-size: clamp(1rem, 3vw, 1.2rem);
        margin: 0;
        text-transform: capitalize;
    }
    .played-badge {
        font-size: 0.72rem;
        color: #888;
        white-space: nowrap;
        flex-shrink: 0;
    }

    /* Team list */
    .team-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.15rem 0.5rem;
    }
    .team-list li {
        font-size: clamp(0.8rem, 2vw, 0.9rem);
        color: #ccc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
    }

    /* Two-zone layout */
    .zones {
        display: grid;
        grid-template-columns: 1fr 1fr;
        border: 1px solid rgba(255, 255, 255, 0.08);
        border-radius: 10px;
        overflow: hidden;
    }
    .zone {
        padding: clamp(0.6rem, 2vw, 0.9rem);
        display: flex;
        flex-direction: column;
        gap: 0.35rem;
    }
    .zone-played {
        background: rgba(255, 255, 255, 0.03);
        border-right: 1px solid rgba(255, 255, 255, 0.08);
    }
    .zone-open {
        background: rgba(255, 255, 255, 0.02);
    }
    .zone-open.has-open {
        background: rgba(56, 189, 248, 0.08);
        border-left: 2px solid var(--color-primary);
    }

    .zone-label {
        font-size: 0.65rem;
        font-weight: 700;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: #666;
        margin-bottom: 0.1rem;
    }
    .zone-empty,
    .zone-pending {
        font-size: 0.78rem;
        color: #666;
        margin: 0;
        font-style: italic;
    }

    /* Points display */
    .pts-row {
        display: flex;
        align-items: baseline;
        gap: 0.2rem;
        flex-wrap: wrap;
    }
    .pts-earned {
        font-size: clamp(1.1rem, 3vw, 1.4rem);
        font-weight: 700;
        color: var(--color-primary);
        line-height: 1;
    }
    .pts-sep {
        font-size: 0.85rem;
        color: #555;
    }
    .pts-max {
        font-size: 0.78rem;
        color: #777;
    }

    /* Accuracy rows */
    .accuracy-block {
        display: flex;
        flex-direction: column;
        gap: 0.3rem;
        margin-top: 0.1rem;
    }
    .accuracy-row {
        display: flex;
        align-items: center;
        gap: 0.35rem;
    }
    .acc-label {
        font-size: 0.68rem;
        color: #888;
        width: 2.6rem;
        flex-shrink: 0;
    }
    .dots {
        display: flex;
        gap: 3px;
        flex-wrap: wrap;
        flex: 1;
    }
    .dot {
        width: 9px;
        height: 9px;
        border-radius: 50%;
        flex-shrink: 0;
    }
    .dot-correct  { background: var(--color-success, #4ade80); }
    .dot-wrong    { background: #ef4444; }
    .dot-pending  { background: #666; }
    .dot-none     { background: transparent; border: 1px solid #444; }

    .acc-count {
        font-size: 0.7rem;
        color: #999;
        white-space: nowrap;
        flex-shrink: 0;
    }

    /* Open zone */
    .open-count {
        font-size: clamp(1.3rem, 4vw, 1.7rem);
        font-weight: 700;
        color: var(--color-primary);
        line-height: 1;
    }
    .open-sub {
        font-size: 0.72rem;
        color: #aaa;
        line-height: 1.3;
    }
    .open-sub.muted {
        color: #666;
        font-style: italic;
    }
    .open-pts {
        font-size: 0.72rem;
        color: #aaa;
        margin-top: 0.15rem;
    }
    .open-pts strong {
        color: var(--color-primary);
    }
    .locked-icon {
        font-size: 1.1rem;
        line-height: 1;
    }

    /* CTA */
    .view-btn {
        display: block;
        text-align: center;
        background: rgba(56, 189, 248, 0.1);
        color: var(--color-primary);
        padding: clamp(0.4rem, 1vw, 0.5rem);
        border-radius: 6px;
        text-decoration: none;
        transition: all 0.2s;
        font-size: clamp(0.8rem, 2vw, 0.9rem);
        margin-top: auto;
    }
    .view-btn:hover {
        background: var(--color-primary);
        color: var(--color-bg);
    }

    /* Narrow viewport: stack zones vertically */
    @media (max-width: 480px) {
        .groups-grid {
            grid-template-columns: 1fr;
        }
        .zones {
            grid-template-columns: 1fr;
        }
        .zone-played {
            border-right: none;
            border-bottom: 1px solid rgba(255, 255, 255, 0.08);
        }
        .zone-open.has-open {
            border-left: none;
            border-top: 2px solid var(--color-primary);
        }
    }
</style>
