// api/events.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

export default async function handler(req, res) {
  try {
    const url =
      `${BASE}/sports/${SPORT}/odds` +
      `?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API failed");

    const data = await r.json();

    const games = data.map(g => ({
      id: g.id,
      commence_time: g.commence_time,
      home_team: g.home_team,
      away_team: g.away_team
    }));

    res.status(200).json(games);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "events_failed" });
  }
}
