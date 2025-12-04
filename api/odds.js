// api/odds.js

import fetch from "node-fetch";

export default async function handler(req, res) {
  const SPORT = "americanfootball_nfl";
  const REGIONS = "us";
  const MARKETS = "h2h,spreads,totals";

  const apiKey = process.env.ODDS_API_KEY;

  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?apiKey=${apiKey}&regions=${REGIONS}&markets=${MARKETS}`;

  try {
    const resp = await fetch(url);

    if (!resp.ok) {
      const txt = await resp.text();
      return res.status(resp.status).json({ error: txt });
    }

    const data = await resp.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
