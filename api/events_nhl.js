// /api/events_nhl.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "icehockey_nhl";
const BASE = "https://api.the-odds-api.com/v4";

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.3,
  fanduel: 1.0,
  draftkings: 1.0
};

const implied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

export default async function handler(req, res) {
  const r = await fetch(
    `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=us&markets=h2h&oddsFormat=american`
  );

  const data = await r.json();

  res.status(200).json(
    data.map(g => ({
      id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      commence_time: g.commence_time,
      best: {}
    }))
  );
}
