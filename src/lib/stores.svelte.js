export const userStore = $state({
    user: null,
    loading: true,
    isAdmin: false
});

export const matchStore = $state({
    matches: [],
    loading: true,
    error: null
});

export const predictionStore = $state({
    predictions: {},
    loading: true,
    error: null
});

