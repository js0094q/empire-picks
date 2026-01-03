// api/props.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

function implied(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

function confidenceScore(sharp, pub) {
  return Math.min(1, Math.abs(sharp - pub) * 4);
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "missing_event_id" });

  try {
    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds` +
      `?regions=us&markets=player_pass_yds,player_rush_yds&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("props fetch failed");

    const game = await r.json();

    const plays = [];

    game.bookmakers.forEach(bm => {
      bm.markets.forEach(m => {
        m.outcomes.forEach(o => {
          const sharp = implied(o.price);
          const pub = 0.5; // placeholder until you add handle data

          const score = confidenceScore(sharp, pub);

          plays.push({
            market: m.key,
            player: o.description,
            side: o.name,
            line: o.point,
            odds: o.price,
            sharpProb: sharp,
            publicProb: pub,
            confidenceScore: score,
            decision: score >= 0.6 ? "PLAY" : "PASS",
            direction: sharp > pub ? "↑" : "↓"
          });
        });
      });
    });

    res.status(200).json({ plays });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "props_failed" });
  }
}
