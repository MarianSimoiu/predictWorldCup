export const KNOCKOUT_STAGES = ['ROUND_OF_16', 'QUARTER_FINALS', 'SEMI_FINALS', 'THIRD_PLACE', 'FINAL'];

export function isKnockoutStage(stage) {
    return KNOCKOUT_STAGES.includes(stage);
}

export function calculatePredictionScore(prediction, actualResult, actualTotalGoals, doublePoints = false) {
    let points = 0;
    let resultCorrect = false;
    let goalsCorrect = null;

    if (!prediction || actualResult === null) return { points, resultCorrect, goalsCorrect };

    if (prediction.predictedResult === actualResult) {
        resultCorrect = true;
    }

    if (prediction.predictedGoalsTier && actualTotalGoals !== null) {
        const tier = prediction.predictedGoalsTier;
        goalsCorrect = false;
        if (tier === '0-1' && actualTotalGoals <= 1) goalsCorrect = true;
        else if (tier === '2-3' && actualTotalGoals >= 2 && actualTotalGoals <= 3) goalsCorrect = true;
        else if (tier === '4+' && actualTotalGoals >= 4) goalsCorrect = true;
    }

    if (resultCorrect && goalsCorrect) {
        points = 6;
    } else if (resultCorrect || goalsCorrect) {
        points = 3;
    } else {
        points = 0;
    }

    if (doublePoints) points *= 2;
    if (prediction.isJoker) points *= 3;

    return { points, resultCorrect, goalsCorrect };
}

// Knockout trio scoring: 2^n where n = number of correct predictions (advancing / goals / departure)
export function calculateKnockoutScore(prediction, actualAdvancing, actualTotalGoals, actualDepartureMethod) {
    let advancingCorrect = false;
    let goalsCorrect = false;
    let departureCorrect = false;

    if (!prediction || actualAdvancing === null) {
        return { points: 0, advancingCorrect, goalsCorrect, departureCorrect };
    }

    advancingCorrect = prediction.predictedAdvancing === actualAdvancing;

    if (prediction.predictedGoalsTier && actualTotalGoals !== null) {
        const tier = prediction.predictedGoalsTier;
        if (tier === '0-1' && actualTotalGoals <= 1) goalsCorrect = true;
        else if (tier === '2-3' && actualTotalGoals >= 2 && actualTotalGoals <= 3) goalsCorrect = true;
        else if (tier === '4+' && actualTotalGoals >= 4) goalsCorrect = true;
    }

    if (actualDepartureMethod !== null) {
        departureCorrect = prediction.predictedDepartureMethod === actualDepartureMethod;
    }

    const correctCount = (advancingCorrect ? 1 : 0) + (goalsCorrect ? 1 : 0) + (departureCorrect ? 1 : 0);
    const points = correctCount > 0 ? Math.pow(2, correctCount) : 0;

    return { points, advancingCorrect, goalsCorrect, departureCorrect };
}
