// /api/props_nhl.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "icehockey_nhl";
const BASE = "https://api.the-odds-api.com/v4";

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.3,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9
};

const implied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const noVig = (a, b) => {
  const s = a + b;
  return s ? [a / s, b / s] : [0.5, 0.5];
};

const weighted = arr =>
  arr.reduce((s, x) => s + x.p * x.w, 0) /
  arr.reduce((s, x) => s + x.w, 0);

const ev = (fair, odds, stab) => (fair - implied(odds)) * stab;

export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing ID" });

  const markets = [
    "player_shots_on_goal",
    "player_points",
    "player_goals",
    "player_assists",
    "player_goalie_saves"
  ];

  const r = await fetch(
    `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}&regions=us&markets=${markets.join(",")}`
  );

  const json = await r.json();
  const event = Array.isArray(json) ? json[0] : json;

  res.status(200).json({ categories: event ? {} : {} });
}
