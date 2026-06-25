<script>
    import { collection, query, where, onSnapshot } from 'firebase/firestore';
    import { db } from '../lib/firebase.js';

    let { matchId, team1Name, team2Name, isFinished = false } = $props();

    let predictions = $state([]);
    let loading = $state(true);

    $effect(() => {
        loading = true;
        const q = query(collection(db, 'predictions'), where('matchId', '==', String(matchId)));
        const unsub = onSnapshot(q, (snap) => {
            const preds = [];
            snap.forEach(d => preds.push(d.data()));
            // Sort: for finished games by points desc; otherwise group by predicted result
            if (isFinished) {
                preds.sort((a, b) => (b.pointsAwarded || 0) - (a.pointsAwarded || 0));
            } else {
                const order = { team1: 0, draw: 1, team2: 2 };
                preds.sort((a, b) => (order[a.predictedResult] ?? 9) - (order[b.predictedResult] ?? 9));
            }
            predictions = preds;
            loading = false;
        }, () => { loading = false; });
        return unsub;
    });

    let stats = $derived.by(() => {
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
            dist
        };
    });

    function resultLabel(p) {
        if (p.predictedResult === 'team1') return team1Name;
        if (p.predictedResult === 'team2') return team2Name;
        return 'Draw';
    }
</script>

{#if !loading && predictions.length > 0}
    <div class="community-picks">
        <div class="cp-header">🌍 Community Picks <span class="cp-count">({predictions.length})</span></div>

        {#if stats}
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
        {/if}

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

    /* Bar */
    .cp-bar-wrap { margin-bottom: 0.6rem; }
    .cp-bar {
        display: flex;
        height: 20px;
        border-radius: 6px;
        overflow: hidden;
        background: rgba(255,255,255,0.04);
    }
    .cp-seg {
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 0.68rem;
        font-weight: 700;
        color: rgba(255,255,255,0.9);
        transition: width 0.5s ease;
        min-width: 0;
        overflow: hidden;
    }
    .cp-t1   { background: rgba(56,  189, 248, 0.55); }
    .cp-draw { background: rgba(156, 163, 175, 0.4);  }
    .cp-t2   { background: rgba(251, 146,  60, 0.55); }
    .cp-legend {
        display: flex;
        justify-content: space-between;
        font-size: 0.7rem;
        margin-top: 0.28rem;
        gap: 0.5rem;
    }
    .cp-leg { color: #777; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .cp-leg-t1   { color: rgba(56,  189, 248, 0.8); }
    .cp-leg-draw { color: #9ca3af; flex-shrink: 0; }
    .cp-leg-t2   { color: rgba(251, 146,  60, 0.8); text-align: right; }

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
        min-width: 90px;
        max-width: 130px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .cp-pick { color: #fff; font-weight: 700; flex-shrink: 0; }
    .cp-goals {
        color: #888;
        font-size: 0.72rem;
        background: rgba(255,255,255,0.06);
        padding: 0.08rem 0.3rem;
        border-radius: 3px;
        flex-shrink: 0;
    }
    .cp-joker { font-size: 0.78rem; flex-shrink: 0; }
    .cp-pts {
        margin-left: auto;
        font-weight: 700;
        font-size: 0.78rem;
        flex-shrink: 0;
    }
    .pts-good { color: #4ade80; }
    .pts-zero { color: #555; }
</style>
