<script>
    import { userStore } from '../lib/stores.svelte.js';
    import { predictionStore, matchStore } from '../lib/stores.svelte.js';
    import { savePrediction, saveKnockoutPrediction } from '../lib/db.js';
    import { isKnockoutStage } from '../lib/scoring.js';

    let { match, existingPrediction = null } = $props();

    let result = $state(existingPrediction?.predictedResult || null);
    let goalsTier = $state(existingPrediction?.predictedGoalsTier || null);
    let isJoker = $state(existingPrediction?.isJoker || false);
    let predictedAdvancing = $state(existingPrediction?.predictedAdvancing || null);
    let predictedDepartureMethod = $state(existingPrediction?.predictedDepartureMethod || null);
    let isSaving = $state(false);
    let saveMessage = $state('');

    $effect(() => {
        if (existingPrediction) {
            result = existingPrediction.predictedResult || null;
            goalsTier = existingPrediction.predictedGoalsTier || null;
            isJoker = existingPrediction.isJoker || false;
            predictedAdvancing = existingPrediction.predictedAdvancing || null;
            predictedDepartureMethod = existingPrediction.predictedDepartureMethod || null;
        }
    });

    function isPlaceholderTeam(teamName) {
        if (!teamName) return true;
        const name = teamName.toLowerCase();
        return name.includes('winner') ||
               name.includes('runner-up') ||
               name.includes('finalist') ||
               name.includes('tbd');
    }

    let isKnockout = $derived(isKnockoutStage(match?.stage));

    let teamsPlaceholder = $derived(
        isPlaceholderTeam(match?.team1?.name) || isPlaceholderTeam(match?.team2?.name)
    );

    let isLocked = $derived.by(() => {
        if (teamsPlaceholder) return true;
        if (!match?.kickoff) return false;
        const kickoffTime = match.kickoff instanceof Date ? match.kickoff.getTime() : new Date(match.kickoff).getTime();
        return new Date().getTime() >= (kickoffTime - 60 * 60 * 1000);
    });

    // True if existing prediction is missing knockout trio fields
    let isIncomplete = $derived(
        isKnockout &&
        !!existingPrediction &&
        (!existingPrediction.predictedAdvancing || !existingPrediction.predictedGoalsTier || !existingPrediction.predictedDepartureMethod)
    );

    // True if user already played their joker on a DIFFERENT match
    let jokerUsedElsewhere = $derived.by(() => {
        return Object.values(predictionStore.predictions).some(p =>
            p.isJoker === true && String(p.matchId) !== String(match?.id)
        );
    });

    async function handleSave() {
        if (!result) {
            saveMessage = 'Please select a result (W/D/L).';
            return;
        }

        isSaving = true;
        saveMessage = '';
        try {
            await savePrediction(userStore.user.uid, match.id, result, goalsTier, isJoker);
            saveMessage = 'Prediction saved successfully! ✅';
        } catch (err) {
            saveMessage = `Error: ${err.message}`;
        }
        isSaving = false;
    }

    async function handleKnockoutSave() {
        if (!predictedAdvancing) {
            saveMessage = 'Please select which team advances.';
            return;
        }
        if (!goalsTier) {
            saveMessage = 'Please select a goals tier for 90 min.';
            return;
        }
        if (!predictedDepartureMethod) {
            saveMessage = 'Please select how the match ends.';
            return;
        }

        isSaving = true;
        saveMessage = '';
        try {
            await saveKnockoutPrediction(userStore.user.uid, match.id, predictedAdvancing, goalsTier, predictedDepartureMethod);
            saveMessage = 'Prediction saved successfully! ✅';
        } catch (err) {
            saveMessage = `Error: ${err.message}`;
        }
        isSaving = false;
    }
</script>

<div class="prediction-card" class:double-pts={match?.doublePoints && !isKnockout} class:joker-active={isJoker} class:knockout-card={isKnockout}>
    {#if match?.doublePoints && !isKnockout}
        <div class="double-pts-banner">⚡ Double Points Match — up to 12 pts</div>
    {/if}
    {#if match?.jokerEligible && isJoker && !isKnockout}
        <div class="joker-banner">🃏 Joker Card Active — up to 18 pts</div>
    {/if}
    {#if isKnockout}
        <div class="knockout-banner">⚽ Knockout Trio — up to 8 pts</div>
    {/if}
    <div class="header">
        <h3>Your Prediction</h3>
        <div class="header-badges">
            {#if teamsPlaceholder}
                <span class="badge pending">PENDING TEAMS 🔒</span>
            {:else if isIncomplete}
                <span class="badge incomplete">INCOMPLETE ⚠️</span>
            {:else if isLocked}
                <span class="badge locked">LOCKED 🔒</span>
            {:else}
                <span class="badge open">OPEN</span>
            {/if}
        </div>
    </div>

    {#if teamsPlaceholder}
        <div class="pending-info">
            <span class="pending-icon">ℹ️</span>
            <div>
                <strong>Predictions not yet available</strong>
                <p>This match features placeholder teams that haven't qualified yet. Predictions will open once both competing teams are officially determined from earlier rounds.</p>
            </div>
        </div>
    {/if}

    {#if isKnockout && isIncomplete && !teamsPlaceholder}
        <div class="incomplete-info">
            <span class="incomplete-icon">⚠️</span>
            <div>
                <strong>Prediction incomplete</strong>
                <p>This match uses the new Knockout Trio format. Complete all 3 predictions below to be eligible for points.</p>
            </div>
        </div>
    {/if}

    <div class="form" class:dimmed={teamsPlaceholder}>

        {#if isKnockout}
            <!-- ===== KNOCKOUT TRIO FORM ===== -->
            <div class="scope-note knockout-scope">
                ⚽ Knockout Trio: predict <strong>who advances</strong>, <strong>goals in 90 min</strong>, and <strong>how the match ends</strong>. Score: <strong>2^n pts</strong> (n = correct picks).
            </div>

            <div class="section">
                <h4>1. Who Advances? (Required)</h4>
                <div class="options">
                    <button
                        class="option-btn {predictedAdvancing === 'team1' ? 'selected' : ''}"
                        onclick={() => predictedAdvancing = 'team1'}
                        disabled={isLocked}>
                        {match.team1.name}
                    </button>
                    <button
                        class="option-btn {predictedAdvancing === 'team2' ? 'selected' : ''}"
                        onclick={() => predictedAdvancing = 'team2'}
                        disabled={isLocked}>
                        {match.team2.name}
                    </button>
                </div>
            </div>

            <div class="section">
                <h4>2. Goals in 90 min (Required)</h4>
                <div class="options">
                    <button
                        class="option-btn {goalsTier === '0-1' ? 'selected' : ''}"
                        onclick={() => goalsTier = goalsTier === '0-1' ? null : '0-1'}
                        disabled={isLocked}>
                        0-1 Goals
                    </button>
                    <button
                        class="option-btn {goalsTier === '2-3' ? 'selected' : ''}"
                        onclick={() => goalsTier = goalsTier === '2-3' ? null : '2-3'}
                        disabled={isLocked}>
                        2-3 Goals
                    </button>
                    <button
                        class="option-btn {goalsTier === '4+' ? 'selected' : ''}"
                        onclick={() => goalsTier = goalsTier === '4+' ? null : '4+'}
                        disabled={isLocked}>
                        4+ Goals
                    </button>
                </div>
                <small>Based on 90 min only — extra time goals don't count. Tap again to deselect.</small>
            </div>

            <div class="section">
                <h4>3. How Does It End? (Required)</h4>
                <div class="options departure-options">
                    <button
                        class="option-btn {predictedDepartureMethod === 'REGULAR' ? 'selected' : ''}"
                        onclick={() => predictedDepartureMethod = 'REGULAR'}
                        disabled={isLocked}>
                        90 min
                    </button>
                    <button
                        class="option-btn {predictedDepartureMethod === 'EXTRA_TIME' ? 'selected' : ''}"
                        onclick={() => predictedDepartureMethod = 'EXTRA_TIME'}
                        disabled={isLocked}>
                        Extra Time
                    </button>
                    <button
                        class="option-btn {predictedDepartureMethod === 'PENALTY_SHOOTOUT' ? 'selected' : ''}"
                        onclick={() => predictedDepartureMethod = 'PENALTY_SHOOTOUT'}
                        disabled={isLocked}>
                        Penalties
                    </button>
                </div>
            </div>

            {#if !isLocked}
                <button
                    class="save-btn"
                    onclick={handleKnockoutSave}
                    disabled={isSaving || !predictedAdvancing || !goalsTier || !predictedDepartureMethod}>
                    {isSaving ? 'Saving...' : 'Save Trio Prediction'}
                </button>
            {/if}

            {#if saveMessage}
                <div class="message {saveMessage.includes('Error') ? 'error' : 'success'}">
                    {saveMessage}
                </div>
            {/if}

            <div class="scoring-guide">
                <h5>💡 How Knockout Trio Scoring Works</h5>
                <ul>
                    <li><span class="points-badge">+8 pts</span><strong>All 3 correct:</strong> 2³ — advances + goals tier + departure method.</li>
                    <li><span class="points-badge">+4 pts</span><strong>Any 2 correct:</strong> 2² — two out of three predictions right.</li>
                    <li><span class="points-badge">+2 pts</span><strong>Any 1 correct:</strong> 2¹ — one prediction right.</li>
                    <li><span class="points-badge">0 pts</span><strong>None correct:</strong> all three predictions wrong.</li>
                </ul>
                <div class="strategy-tip">
                    <strong>Strategy Tip:</strong> All three picks are required for a valid prediction. No joker card in knockout rounds.
                </div>
            </div>

        {:else}
            <!-- ===== REGULAR FORM (group stage / round of 32) ===== -->
            <div class="scope-note">
                ⏱ Predictions are based on <strong>90 minutes of play only</strong> — extra time &amp; penalties do not count.
            </div>
            <div class="section">
                <h4>1. Match Result (Required)</h4>
                <div class="options">
                    <button
                        class="option-btn {result === 'team1' ? 'selected' : ''}"
                        onclick={() => result = 'team1'}
                        disabled={isLocked}>
                        {match.team1.name} Win
                    </button>
                    <button
                        class="option-btn {result === 'draw' ? 'selected' : ''}"
                        onclick={() => result = 'draw'}
                        disabled={isLocked}>
                        Draw
                    </button>
                    <button
                        class="option-btn {result === 'team2' ? 'selected' : ''}"
                        onclick={() => result = 'team2'}
                        disabled={isLocked}>
                        {match.team2.name} Win
                    </button>
                </div>
            </div>

            <div class="section">
                <h4>2. Total Goals (Optional)</h4>
                <div class="options">
                    <button
                        class="option-btn {goalsTier === '0-1' ? 'selected' : ''}"
                        onclick={() => goalsTier = goalsTier === '0-1' ? null : '0-1'}
                        disabled={isLocked}>
                        0-1 Goals
                    </button>
                    <button
                        class="option-btn {goalsTier === '2-3' ? 'selected' : ''}"
                        onclick={() => goalsTier = goalsTier === '2-3' ? null : '2-3'}
                        disabled={isLocked}>
                        2-3 Goals
                    </button>
                    <button
                        class="option-btn {goalsTier === '4+' ? 'selected' : ''}"
                        onclick={() => goalsTier = goalsTier === '4+' ? null : '4+'}
                        disabled={isLocked}>
                        4+ Goals
                    </button>
                </div>
                <small>Tap an active option again to deselect.</small>
            </div>

            {#if match?.jokerEligible && !isLocked}
                <div class="joker-section" class:joker-on={isJoker} class:joker-disabled={jokerUsedElsewhere && !isJoker}>
                    <div class="joker-info">
                        <span class="joker-icon">🃏</span>
                        <div>
                            <strong class="joker-title">Joker Card</strong>
                            <span class="joker-desc">
                                {#if jokerUsedElsewhere}
                                    Already used on another match
                                {:else if isJoker}
                                    Active — correct prediction scores 3×
                                {:else}
                                    Play your Joker on this match for 3× points
                                {/if}
                            </span>
                        </div>
                    </div>
                    <button
                        class="joker-toggle {isJoker ? 'joker-toggle-on' : 'joker-toggle-off'}"
                        onclick={() => isJoker = !isJoker}
                        disabled={jokerUsedElsewhere && !isJoker}>
                        {isJoker ? 'Remove Joker' : 'Play Joker'}
                    </button>
                </div>
            {/if}

            {#if !isLocked}
                <button class="save-btn" class:save-btn-joker={isJoker} onclick={handleSave} disabled={isSaving || !result}>
                    {isSaving ? 'Saving...' : isJoker ? '🃏 Save with Joker' : 'Save Prediction'}
                </button>
            {/if}

            {#if saveMessage}
                <div class="message {saveMessage.includes('Error') ? 'error' : 'success'}">
                    {saveMessage}
                </div>
            {/if}

            <div class="scoring-guide">
                <h5>💡 How Scoring Works{match?.doublePoints ? ' · ⚡ 2×' : ''}{isJoker ? ' · 🃏 3×' : ''}</h5>
                <ul>
                    <li>
                        <span class="points-badge">{isJoker ? '+18' : match?.doublePoints ? '+12' : '+6'} pts</span>
                        <strong>Perfect Combo:</strong> Correct Match Result AND Correct Total Goals Tier.
                    </li>
                    <li>
                        <span class="points-badge">{isJoker ? '+9' : match?.doublePoints ? '+6' : '+3'} pts</span>
                        <strong>Partial Match:</strong> Correct Match Result OR Correct Total Goals Tier.
                    </li>
                    <li>
                        <span class="points-badge">0 pts</span>
                        <strong>Incorrect:</strong> Neither prediction matches the final outcome.
                    </li>
                </ul>
                <div class="strategy-tip">
                    <strong>Strategy Tip:</strong> You should always predict the Goals Tier! Leaving it empty caps your maximum score at +3 points. Guessing the goals tier wrong carries <strong>no penalty</strong>—you will still get 3 points if your match result prediction is correct.
                </div>
            </div>
        {/if}

    </div>
</div>

<style>
    .prediction-card {
        background: rgba(255, 255, 255, 0.05);
        border: 1px solid rgba(255, 255, 255, 0.1);
        border-radius: 12px;
        overflow: hidden;
        margin-top: clamp(1rem, 3vw, 2rem);
    }
    .prediction-card.double-pts {
        border-color: rgba(245, 158, 11, 0.4);
        background: rgba(245, 158, 11, 0.04);
    }
    .prediction-card.knockout-card {
        border-color: rgba(99, 179, 237, 0.35);
        background: rgba(99, 179, 237, 0.03);
    }
    .double-pts-banner {
        background: linear-gradient(90deg, rgba(245,158,11,0.18), transparent);
        border-bottom: 1px solid rgba(245,158,11,0.25);
        color: var(--color-accent);
        font-size: 0.78rem;
        font-weight: 700;
        padding: 0.5rem clamp(0.75rem, 3vw, 1.5rem);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .joker-banner {
        background: linear-gradient(90deg, rgba(139,92,246,0.18), transparent);
        border-bottom: 1px solid rgba(139,92,246,0.3);
        color: #a78bfa;
        font-size: 0.78rem;
        font-weight: 700;
        padding: 0.5rem clamp(0.75rem, 3vw, 1.5rem);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .knockout-banner {
        background: linear-gradient(90deg, rgba(99,179,237,0.15), transparent);
        border-bottom: 1px solid rgba(99,179,237,0.2);
        color: #63b3ed;
        font-size: 0.78rem;
        font-weight: 700;
        padding: 0.5rem clamp(0.75rem, 3vw, 1.5rem);
        letter-spacing: 0.04em;
        text-transform: uppercase;
    }
    .prediction-card.joker-active {
        border-color: rgba(139,92,246,0.4);
        background: rgba(139,92,246,0.04);
    }
    .joker-section {
        background: rgba(139,92,246,0.06);
        border: 1px solid rgba(139,92,246,0.2);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin-bottom: 1.25rem;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 1rem;
        flex-wrap: wrap;
    }
    .joker-section.joker-on {
        background: rgba(139,92,246,0.12);
        border-color: rgba(139,92,246,0.45);
    }
    .joker-section.joker-disabled {
        opacity: 0.5;
    }
    .joker-info {
        display: flex;
        align-items: center;
        gap: 0.6rem;
    }
    .joker-icon { font-size: 1.4rem; }
    .joker-title {
        display: block;
        font-size: 0.88rem;
        color: #a78bfa;
        font-weight: 700;
    }
    .joker-desc {
        display: block;
        font-size: 0.75rem;
        color: #888;
        margin-top: 0.1rem;
    }
    .joker-toggle {
        padding: 0.4rem 1rem;
        border-radius: 6px;
        font-size: 0.82rem;
        font-weight: 700;
        cursor: pointer;
        border: none;
        white-space: nowrap;
        transition: all 0.15s;
    }
    .joker-toggle-off {
        background: rgba(139,92,246,0.15);
        color: #a78bfa;
        border: 1px solid rgba(139,92,246,0.35);
    }
    .joker-toggle-off:hover:not(:disabled) {
        background: rgba(139,92,246,0.25);
    }
    .joker-toggle-on {
        background: #7c3aed;
        color: white;
    }
    .joker-toggle:disabled {
        opacity: 0.4;
        cursor: not-allowed;
    }
    .save-btn-joker {
        background: linear-gradient(135deg, #7c3aed, #a78bfa) !important;
    }
    .header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        flex-wrap: wrap;
        gap: 0.5rem;
        border-bottom: 1px solid rgba(255, 255, 255, 0.1);
        padding: 0 clamp(0.75rem, 3vw, 1.5rem) 1rem;
        margin-bottom: 1.5rem;
        margin-top: clamp(0.75rem, 3vw, 1.5rem);
    }
    .header-badges {
        display: flex;
        gap: 0.4rem;
        flex-wrap: wrap;
    }
    h3 {
        margin: 0;
        color: var(--color-primary);
    }
    .badge {
        padding: 0.25rem 0.5rem;
        border-radius: 4px;
        font-size: 0.8rem;
        font-weight: bold;
    }
    .badge.open {
        background: rgba(16, 185, 129, 0.2);
        color: var(--color-success);
    }
    .badge.locked {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-danger);
    }
    .badge.pending {
        background: rgba(245, 158, 11, 0.2);
        color: var(--color-accent);
    }
    .badge.incomplete {
        background: rgba(251, 146, 60, 0.2);
        color: #fb923c;
    }

    .pending-info, .incomplete-info {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 8px;
        padding: 0.75rem 1rem;
        margin: 0 clamp(0.75rem, 3vw, 1.5rem) 1.5rem;
        display: flex;
        gap: 0.75rem;
        align-items: flex-start;
        font-size: 0.85rem;
        line-height: 1.4;
        color: #ccc;
    }
    .incomplete-info {
        background: rgba(251, 146, 60, 0.08);
        border-color: rgba(251, 146, 60, 0.25);
    }
    .pending-info strong, .incomplete-info strong {
        color: var(--color-accent);
        display: block;
        margin-bottom: 0.25rem;
    }
    .incomplete-info strong { color: #fb923c; }
    .pending-info p, .incomplete-info p {
        margin: 0;
    }
    .pending-icon, .incomplete-icon {
        font-size: 1.1rem;
        margin-top: 0.1rem;
    }

    .scope-note {
        background: rgba(56, 189, 248, 0.07);
        border: 1px solid rgba(56, 189, 248, 0.2);
        border-radius: 6px;
        padding: 0.5rem 0.75rem;
        font-size: 0.8rem;
        color: #94a3b8;
        margin-bottom: 1.25rem;
        line-height: 1.4;
    }
    .scope-note.knockout-scope {
        background: rgba(99, 179, 237, 0.07);
        border-color: rgba(99, 179, 237, 0.2);
        color: #a8c5da;
    }
    .scope-note strong {
        color: var(--color-primary);
    }
    .dimmed {
        opacity: 0.5;
        pointer-events: none;
    }
    .form {
        padding: 0 clamp(0.75rem, 3vw, 1.5rem) clamp(0.75rem, 3vw, 1.5rem);
    }

    .section {
        margin-bottom: 1.5rem;
    }
    h4 {
        margin: 0 0 0.5rem 0;
        font-size: 1rem;
        color: #ccc;
    }
    .options {
        display: flex;
        gap: 0.5rem;
    }
    .departure-options .option-btn {
        font-size: clamp(0.7rem, 2vw, 0.9rem);
    }
    .option-btn {
        flex: 1;
        min-width: 0;
        background: rgba(0, 0, 0, 0.2);
        border: 1px solid rgba(255, 255, 255, 0.2);
        color: white;
        padding: clamp(0.5rem, 2vw, 0.75rem) clamp(0.25rem, 1.5vw, 0.75rem);
        border-radius: 6px;
        cursor: pointer;
        transition: all 0.2s;
        font-size: clamp(0.75rem, 2.5vw, 1rem);
        line-height: 1.2;
        word-break: break-word;
        overflow-wrap: break-word;
        hyphens: auto;
    }
    .option-btn:not(:disabled):hover {
        border-color: var(--color-primary);
        background: rgba(56, 189, 248, 0.1);
    }
    .option-btn.selected {
        background: var(--color-primary);
        border-color: var(--color-primary);
        color: var(--color-bg);
        font-weight: bold;
    }
    .option-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
    }
    small {
        display: block;
        margin-top: 0.5rem;
        color: #888;
    }

    .save-btn {
        width: 100%;
        background: linear-gradient(135deg, var(--color-accent), #f59e0b);
        color: var(--color-bg);
        border: none;
        padding: 1rem;
        border-radius: 6px;
        font-weight: bold;
        font-size: 1.1rem;
        cursor: pointer;
        transition: transform 0.1s;
    }
    .save-btn:active {
        transform: scale(0.98);
    }
    .save-btn:disabled {
        opacity: 0.5;
        cursor: not-allowed;
        background: #555;
        color: #888;
    }

    .message {
        margin-top: 1rem;
        padding: 0.75rem;
        border-radius: 6px;
        text-align: center;
    }
    .message.success {
        background: rgba(16, 185, 129, 0.2);
        color: var(--color-success);
    }
    .message.error {
        background: rgba(239, 68, 68, 0.2);
        color: var(--color-danger);
    }

    .scoring-guide {
        margin-top: 1.5rem;
        padding-top: 1.5rem;
        border-top: 1px solid rgba(255, 255, 255, 0.1);
        text-align: left;
    }
    .scoring-guide h5 {
        margin: 0 0 0.75rem 0;
        font-size: 0.95rem;
        color: var(--color-primary);
        font-weight: bold;
    }
    .scoring-guide ul {
        list-style: none;
        padding: 0;
        margin: 0 0 1rem 0;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
    }
    .scoring-guide li {
        font-size: 0.85rem;
        color: #ccc;
        display: flex;
        align-items: center;
        gap: 0.5rem;
    }
    .points-badge {
        background: rgba(56, 189, 248, 0.15);
        color: var(--color-primary);
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
        font-size: 0.75rem;
        font-weight: bold;
        min-width: 45px;
        text-align: center;
    }
    .strategy-tip {
        background: rgba(245, 158, 11, 0.08);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 6px;
        padding: 0.75rem;
        font-size: 0.8rem;
        color: #e2e8f0;
        line-height: 1.4;
    }
    .strategy-tip strong {
        color: var(--color-accent);
    }

    /* On narrow phones, stack result buttons vertically so long team
       names (e.g. "Saudi Arabia Win") don't overflow a 3-column row */
    @media (max-width: 420px) {
        .section:first-of-type .options {
            flex-direction: column;
        }
        .section:first-of-type .option-btn {
            width: 100%;
            text-align: center;
        }
    }
</style>
