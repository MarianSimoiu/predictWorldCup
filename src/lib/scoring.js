export function calculatePredictionScore(prediction, actualResult, actualTotalGoals) {
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

    return { points, resultCorrect, goalsCorrect };
}
