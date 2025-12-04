// history.js
const { apiClient } = require('./api.js');

/**
 * Returns a snapshot of odds at a given historical timestamp.
 * Endpoint: GET /v4/historical/sports/{sport}/odds [cite: 490]
 * * @param {string} sport - Sport key
 * @param {string} regions - Region code
 * @param {string} date - ISO8601 timestamp (e.g. '2023-10-01T12:00:00Z') [cite: 493]
 * @param {Object} options - markets, oddsFormat
 */
async function getHistoricalOdds(sport, regions, date, options = {}) {
    try {
        const response = await apiClient.get(`/historical/sports/${sport}/odds`, {
            params: {
                regions: regions,
                date: date, // Required parameter for history
                markets: options.markets || 'h2h',
                oddsFormat: options.oddsFormat || 'decimal'
            }
        });
        return response.data;
    } catch (error) {
        console.error(`Error fetching historical odds:`, error.message);
        throw error;
    }
}

module.exports = { getHistoricalOdds };
