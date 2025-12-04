// ============================================================
// /api/history.js — EmpirePicks v1.0
// Historical lines for ATS / O-U / Moneyline trends
// ============================================================

import { apiClient } from "./api.js";

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const date = req.query.date;
  const sport = "americanfootball_nfl";

  if (!apiKey || !date) {
    return res.status(400).json({ error: "Missing API key or date" });
  }

  try {
    const response = await apiClient.get(`/historical/sports/${sport}/odds`, {
      params: {
        regions: "us",
        date,
        markets: "h2h,spreads,totals",
        oddsFormat: "american"
      }
    });

    res.status(200).json(response.data);

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch historical odds",
      details: err.message
    });
  }
}
