// api.js
const axios = require('axios');

// Basic configuration
const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = 'https://api.the-odds-api.com/v4';

// Create a configured axios instance
const apiClient = axios.create({
    baseURL: BASE_URL,
    params: {
        apiKey: API_KEY, // Automatically adds apiKey to every request
    }
});

module.exports = {
    apiClient
};
