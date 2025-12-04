// api/odds.js — Vercel Serverless Function (Node.js runtime)

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
    const r = await fetch(url);
    if (!r.ok) {
      const txt = await r.text();
      return res.status(r.status).json({ error: txt });
    }

    const data = await r.json();
    return res.status(200).json(data);

  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
