<script>
    import { collection, query, where, onSnapshot } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';

    let { matchId, team1Name, team2Name, isFinished = false, isKnockout = false } = $props();

    let predictions = $state([]);
    let loading = $state(true);

    $effect(() => {
        loading = true;
        const q = query(collection(db, 'predictions'), where('matchId', '==', String(matchId)));
        const unsub = onSnapshot(q, (snap) => {
            const preds = [];
            snap.forEach(d => preds.push(d.data()));
            if (isFinished) {
                preds.sort((a, b) => (b.pointsAwarded || 0) - (a.pointsAwarded || 0));
            } else if (isKnockout) {
                const order = { team1: 0, team2: 1 };
                preds.sort((a, b) => (order[effectiveAdv(a)] ?? 9) - (order[effectiveAdv(b)] ?? 9));
            } else {
                const order = { team1: 0, draw: 1, team2: 2 };
                preds.sort((a, b) => (order[a.predictedResult] ?? 9) - (order[b.predictedResult] ?? 9));
            }
            predictions = preds;
            loading = false;
        }, () => { loading = false; });
        return unsub;
    });

    // Group-stage distribution
    let stats = $derived.by(() => {
        if (isKnockout) return null;
        const total = predictions.length;
        if (total === 0) return null;
        const dist = { team1: 0, draw: 0, team2: 0 };
        for (const p of predictions) {
            if (p.predictedResult && dist[p.predictedResult] !== undefined) dist[p.predictedResult]++;
        }
        return {
            total,
            team1Pct: Math.round((dist.team1 / total) * 100),
            drawPct:  Math.round((dist.draw  / total) * 100),
            team2Pct: Math.round((dist.team2 / total) * 100),
        };
    });

    // Derive effective advancing from trio OR old-style result pick (team1/team2 only — draw is unresolvable)
    function effectiveAdv(p) {
        if (p.predictedAdvancing) return p.predictedAdvancing;
        if (p.predictedResult === 'team1' || p.predictedResult === 'team2') return p.predictedResult;
        return null;
    }

    // Knockout trio distributions — includes mapped old-style picks for adv + goals bars
    let trioStats = $derived.by(() => {
        if (!isKnockout) return null;
        // Count every prediction that has a resolvable advancing pick
        const withAdv = predictions.filter(p => effectiveAdv(p) !== null);
        const total = withAdv.length;
        if (total === 0) return null;

        const adv   = { team1: 0, team2: 0 };
        const goals = { '0-1': 0, '2-3': 0, '4+': 0 };
        const dep   = { REGULAR: 0, EXTRA_TIME: 0, PENALTY_SHOOTOUT: 0 };
        let depTotal = 0;

        for (const p of withAdv) {
            const ea = effectiveAdv(p);
            if (adv[ea] !== undefined) adv[ea]++;
            if (p.predictedGoalsTier && goals[p.predictedGoalsTier] !== undefined) goals[p.predictedGoalsTier]++;
            if (p.predictedDepartureMethod && dep[p.predictedDepartureMethod] !== undefined) {
                dep[p.predictedDepartureMethod]++;
                depTotal++;
            }
        }

        const pct  = (n) => Math.round((n / total) * 100);
        // Departure bar only counts those who actually set a method
        const dpct = (n) => depTotal > 0 ? Math.round((n / depTotal) * 100) : 0;
        return {
            total,
            advancing: { team1Pct: pct(adv.team1),  team2Pct: pct(adv.team2) },
            goals:     { lowPct: pct(goals['0-1']), midPct: pct(goals['2-3']), highPct: pct(goals['4+']) },
            departure: { regularPct: dpct(dep.REGULAR), etPct: dpct(dep.EXTRA_TIME), penPct: dpct(dep.PENALTY_SHOOTOUT), hasData: depTotal > 0 },
        };
    });

    function resultLabel(p) {
        if (p.predictedResult === 'team1') return team1Name;
        if (p.predictedResult === 'team2') return team2Name;
        return 'Draw';
    }

    function advLabel(p) {
        const ea = effectiveAdv(p);
        if (ea === 'team1') return team1Name;
        if (ea === 'team2') return team2Name;
        return '—';
    }

    function depLabel(method) {
        if (method === 'REGULAR')          return '90 min';
        if (method === 'EXTRA_TIME')       return 'ET';
        if (method === 'PENALTY_SHOOTOUT') return 'Pen';
        return '—';
    }
</script>

{#if !loading && predictions.length > 0}
    <div class="community-picks">
        <div class="cp-header">🌍 Community Picks <span class="cp-count">({predictions.length})</span></div>

        {#if isKnockout && trioStats}
            <!-- ── Knockout: 3 distribution bars ── -->
            <div class="trio-bars">

                <!-- Bar 1: Advancing team -->
                <div class="trio-bar-block">
                    <div class="trio-bar-label">Advances</div>
                    <div class="cp-bar">
                        {#if trioStats.advancing.team1Pct > 0}
                            <div class="cp-seg cp-t1" style="width:{trioStats.advancing.team1Pct}%"
                                title="{team1Name}: {trioStats.advancing.team1Pct}%">
                                {#if trioStats.advancing.team1Pct >= 10}{trioStats.advancing.team1Pct}%{/if}
                            </div>
                        {/if}
                        {#if trioStats.advancing.team2Pct > 0}
                            <div class="cp-seg cp-t2" style="width:{trioStats.advancing.team2Pct}%"
                                title="{team2Name}: {trioStats.advancing.team2Pct}%">
                                {#if trioStats.advancing.team2Pct >= 10}{trioStats.advancing.team2Pct}%{/if}
                            </div>
                        {/if}
                    </div>
                    <div class="cp-legend">
                        <span class="cp-leg cp-leg-t1">🏠 {team1Name} {trioStats.advancing.team1Pct}%</span>
                        <span class="cp-leg cp-leg-t2">{team2Name} ✈️ {trioStats.advancing.team2Pct}%</span>
                    </div>
                </div>

                <!-- Bar 2: Goals tier -->
                <div class="trio-bar-block">
                    <div class="trio-bar-label">Goals (90 min)</div>
                    <div class="cp-bar">
                        {#if trioStats.goals.lowPct > 0}
                            <div class="cp-seg cp-goals-low" style="width:{trioStats.goals.lowPct}%"
                                title="0-1 Goals: {trioStats.goals.lowPct}%">
                                {#if trioStats.goals.lowPct >= 10}{trioStats.goals.lowPct}%{/if}
                            </div>
                        {/if}
                        {#if trioStats.goals.midPct > 0}
                            <div class="cp-seg cp-goals-mid" style="width:{trioStats.goals.midPct}%"
                                title="2-3 Goals: {trioStats.goals.midPct}%">
                                {#if trioStats.goals.midPct >= 10}{trioStats.goals.midPct}%{/if}
                            </div>
                        {/if}
                        {#if trioStats.goals.highPct > 0}
                            <div class="cp-seg cp-goals-high" style="width:{trioStats.goals.highPct}%"
                                title="4+ Goals: {trioStats.goals.highPct}%">
                                {#if trioStats.goals.highPct >= 10}{trioStats.goals.highPct}%{/if}
                            </div>
                        {/if}
                    </div>
                    <div class="cp-legend">
                        <span class="cp-leg cp-leg-goals-low">0-1 Goals {trioStats.goals.lowPct}%</span>
                        <span class="cp-leg cp-leg-goals-mid">2-3 Goals {trioStats.goals.midPct}%</span>
                        <span class="cp-leg cp-leg-goals-high">4+ Goals {trioStats.goals.highPct}%</span>
                    </div>
                </div>

                <!-- Bar 3: Departure method — only shown when at least one user filled it in -->
                {#if trioStats.departure.hasData}
                <div class="trio-bar-block">
                    <div class="trio-bar-label">Ends via</div>
                    <div class="cp-bar">
                        {#if trioStats.departure.regularPct > 0}
                            <div class="cp-seg cp-dep-regular" style="width:{trioStats.departure.regularPct}%"
                                title="90 min: {trioStats.departure.regularPct}%">
                                {#if trioStats.departure.regularPct >= 10}{trioStats.departure.regularPct}%{/if}
                            </div>
                        {/if}
                        {#if trioStats.departure.etPct > 0}
                            <div class="cp-seg cp-dep-et" style="width:{trioStats.departure.etPct}%"
                                title="Extra Time: {trioStats.departure.etPct}%">
                                {#if trioStats.departure.etPct >= 10}{trioStats.departure.etPct}%{/if}
                            </div>
                        {/if}
                        {#if trioStats.departure.penPct > 0}
                            <div class="cp-seg cp-dep-pen" style="width:{trioStats.departure.penPct}%"
                                title="Penalties: {trioStats.departure.penPct}%">
                                {#if trioStats.departure.penPct >= 10}{trioStats.departure.penPct}%{/if}
                            </div>
                        {/if}
                    </div>
                    <div class="cp-legend">
                        <span class="cp-leg cp-leg-dep-regular">90 min {trioStats.departure.regularPct}%</span>
                        <span class="cp-leg cp-leg-dep-et">ET {trioStats.departure.etPct}%</span>
                        <span class="cp-leg cp-leg-dep-pen">Pen {trioStats.departure.penPct}%</span>
                    </div>
                </div>
                {/if}

            </div>

            <!-- Knockout per-user rows -->
            <div class="cp-list">
                {#each predictions as p (p.userId)}
                    {@const ea = effectiveAdv(p)}
                    <div class="cp-row">
                        <span class="cp-name">{p.displayName || 'Anonymous'}</span>
                        {#if ea}
                            <span class="cp-pick">{advLabel(p)} →</span>
                            {#if p.predictedGoalsTier}
                                <span class="cp-goals">{p.predictedGoalsTier} goals</span>
                            {/if}
                            {#if p.predictedDepartureMethod}
                                <span class="cp-dep">{depLabel(p.predictedDepartureMethod)}</span>
                            {:else if !p.predictedAdvancing}
                                <!-- mapped from old form — no method picked -->
                                <span class="cp-dep cp-dep-mapped">?</span>
                            {/if}
                            {#if isFinished && p.advancingCorrect !== null}
                                <span class="cp-pts" class:pts-good={p.pointsAwarded > 0} class:pts-zero={p.pointsAwarded === 0}>
                                    +{p.pointsAwarded ?? 0} pts
                                </span>
                            {/if}
                        {:else}
                            <span class="cp-incomplete">no pick</span>
                        {/if}
                    </div>
                {/each}
            </div>

        {:else if stats}
            <!-- ── Group stage: single W/D/L bar ── -->
            <div class="cp-bar-wrap">
                <div class="cp-bar">
                    {#if stats.team1Pct > 0}
                        <div class="cp-seg cp-t1" style="width:{stats.team1Pct}%" title="{team1Name}: {stats.team1Pct}%">
                            {#if stats.team1Pct >= 10}{stats.team1Pct}%{/if}
                        </div>
                    {/if}
                    {#if stats.drawPct > 0}
                        <div class="cp-seg cp-draw" style="width:{stats.drawPct}%" title="Draw: {stats.drawPct}%">
                            {#if stats.drawPct >= 10}{stats.drawPct}%{/if}
                        </div>
                    {/if}
                    {#if stats.team2Pct > 0}
                        <div class="cp-seg cp-t2" style="width:{stats.team2Pct}%" title="{team2Name}: {stats.team2Pct}%">
                            {#if stats.team2Pct >= 10}{stats.team2Pct}%{/if}
                        </div>
                    {/if}
                </div>
                <div class="cp-legend">
                    <span class="cp-leg cp-leg-t1">🏠 {team1Name} {stats.team1Pct}%</span>
                    <span class="cp-leg cp-leg-draw">= Draw {stats.drawPct}%</span>
                    <span class="cp-leg cp-leg-t2">{team2Name} ✈️ {stats.team2Pct}%</span>
                </div>
            </div>

            <!-- Group stage per-user rows -->
            <div class="cp-list">
                {#each predictions as p (p.userId)}
                    <div class="cp-row">
                        <span class="cp-name">{p.displayName || 'Anonymous'}</span>
                        <span class="cp-pick">{resultLabel(p)}</span>
                        {#if p.predictedGoalsTier}
                            <span class="cp-goals">{p.predictedGoalsTier} goals</span>
                        {/if}
                        {#if p.isJoker}
                            <span class="cp-joker" title="Joker played">🃏</span>
                        {/if}
                        {#if isFinished && p.resultCorrect !== null}
                            <span class="cp-pts" class:pts-good={p.pointsAwarded > 0} class:pts-zero={p.pointsAwarded === 0}>
                                +{p.pointsAwarded ?? 0} pts
                            </span>
                        {/if}
                    </div>
                {/each}
            </div>
        {/if}

    </div>
{/if}

<style>
    .community-picks {
        border-top: 1px solid rgba(255, 255, 255, 0.07);
        padding-top: 0.85rem;
        margin-top: 0.75rem;
    }
    .cp-header {
        font-size: 0.75rem;
        font-weight: 700;
        color: #888;
        text-transform: uppercase;
        letter-spacing: 0.07em;
        margin-bottom: 0.65rem;
    }
    .cp-count { font-weight: 400; }

    /* Shared bar */
    .cp-bar {
        display: flex;
        height: 18px;
        border-radius: 6px;
        overflow: hidden;
        background: rgba(255,255,255,0.04);
    }
    .cp-seg {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.65rem;
        font-weight: 700;
        color: rgba(255,255,255,0.9);
        transition: width 0.5s ease;
        min-width: 0;
        overflow: hidden;
    }

    /* Group-stage segment colours */
    .cp-t1   { background: rgba(56,  189, 248, 0.55); }
    .cp-draw { background: rgba(156, 163, 175, 0.4);  }
    .cp-t2   { background: rgba(251, 146,  60, 0.55); }

    /* Goals-tier segment colours */
    .cp-goals-low  { background: rgba(74,  222, 128, 0.55); }
    .cp-goals-mid  { background: rgba(251, 191,  36, 0.55); }
    .cp-goals-high { background: rgba(239,  68,  68, 0.55); }

    /* Departure segment colours */
    .cp-dep-regular { background: rgba(99,  179, 237, 0.55); }
    .cp-dep-et      { background: rgba(251, 146,  60, 0.55); }
    .cp-dep-pen     { background: rgba(167,  139, 250, 0.55); }

    /* Group-stage: single bar with wrap */
    .cp-bar-wrap { margin-bottom: 0.6rem; }

    /* Knockout: 3 bar blocks stacked */
    .trio-bars {
        display: flex;
        flex-direction: column;
        gap: 0.55rem;
        margin-bottom: 0.7rem;
    }
    .trio-bar-block { display: flex; flex-direction: column; gap: 0.22rem; }
    .trio-bar-label {
        font-size: 0.65rem;
        font-weight: 700;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.06em;
    }

    /* Legend */
    .cp-legend {
        display: flex;
        justify-content: space-between;
        font-size: 0.68rem;
        gap: 0.4rem;
    }
    .cp-leg { color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp-leg-t1            { color: rgba(56,  189, 248, 0.85); }
    .cp-leg-draw          { color: #9ca3af; flex-shrink: 0; }
    .cp-leg-t2            { color: rgba(251, 146,  60, 0.85); text-align: right; }
    .cp-leg-goals-low     { color: rgba(74,  222, 128, 0.85); }
    .cp-leg-goals-mid     { color: rgba(251, 191,  36, 0.85); text-align: center; flex: 1; }
    .cp-leg-goals-high    { color: rgba(239,  68,  68, 0.85); text-align: right; }
    .cp-leg-dep-regular   { color: rgba(99,  179, 237, 0.85); }
    .cp-leg-dep-et        { color: rgba(251, 146,  60, 0.85); text-align: center; flex: 1; }
    .cp-leg-dep-pen       { color: rgba(167,  139, 250, 0.85); text-align: right; }

    /* Player list */
    .cp-list {
        display: flex;
        flex-direction: column;
        gap: 0.22rem;
        max-height: 200px;
        overflow-y: auto;
        scrollbar-width: thin;
        scrollbar-color: rgba(255,255,255,0.1) transparent;
    }
    .cp-row {
        display: flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.8rem;
        padding: 0.22rem 0.35rem;
        border-radius: 5px;
    }
    .cp-row:hover { background: rgba(255,255,255,0.04); }
    .cp-name {
        color: #bbb;
        font-weight: 600;
        min-width: 80px;
        max-width: 120px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
        flex-shrink: 0;
    }
    .cp-pick { color: #fff; font-weight: 700; flex-shrink: 0; }
    .cp-goals {
        color: #888;
        font-size: 0.7rem;
        background: rgba(255,255,255,0.06);
        padding: 0.07rem 0.3rem;
        border-radius: 3px;
        flex-shrink: 0;
    }
    .cp-dep {
        color: #888;
        font-size: 0.7rem;
        background: rgba(167, 139, 250, 0.1);
        padding: 0.07rem 0.3rem;
        border-radius: 3px;
        flex-shrink: 0;
    }
    .cp-dep-mapped {
        color: #555;
        background: transparent;
    }
    .cp-joker { font-size: 0.78rem; flex-shrink: 0; }
    .cp-incomplete {
        color: #555;
        font-size: 0.72rem;
        font-style: italic;
    }
    .cp-pts {
        margin-left: auto;
        font-weight: 700;
        font-size: 0.78rem;
        flex-shrink: 0;
    }
    .pts-good { color: #4ade80; }
    .pts-zero { color: #555; }
</style>
