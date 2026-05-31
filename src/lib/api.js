export async function fetchWCMatches(apiKey) {
    const BASE_URL = 'https://api.football-data.org/v4';
    const targetUrl = `${BASE_URL}/competitions/WC/matches?season=2026`;
    // Prepend CORS proxy to allow direct requests from the browser
    const proxiedUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    
    try {
        const response = await fetch(proxiedUrl, {
            headers: { 'X-Auth-Token': apiKey }
        });
        
        if (!response.ok) {
            throw new Error(`API Error: ${response.status} ${response.statusText}`);
        }
        
        const data = await response.json();
        return data.matches;
    } catch (err) {
        console.error("Failed to fetch matches:", err);
        throw err;
    }
}
