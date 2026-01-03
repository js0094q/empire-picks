// /api/events.js

import fetch from "node-fetch";
import {
  americanToProb,
  removeVig,
  weightedAverage,
  confidenceScore,
  decisionGate,
  directionArrow
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;
const BASE = "https://api.the-odds-api.com/v4";
const SPORT = "americanfootball_nfl";

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.4,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9
};

export default async function handler(req, res) {
  try {
    const url = `${BASE}/sports/${SPORT}/odds?markets=h2h,spreads,totals&regions=us&oddsFormat=american&apiKey=${API_KEY}`;
    const r = await fetch(url);
    const games = await r.json();

    const output = games.map(game => {
      const marketViews = ["h2h", "spreads", "totals"].map(key => {
        const entries = [];

        game.bookmakers.forEach(b => {
          const m = b.markets.find(x => x.key === key);
          if (!m) return;

          m.outcomes.forEach(o => {
            entries.push({
              prob: americanToProb(o.price),
              odds: o.price,
              weight: BOOK_WEIGHTS[b.key] || 1,
              book: b.key,
              side: o.name,
              point: o.point ?? null
            });
          });
        });

        if (entries.length < 2) return null;

        const sharpProb = weightedAverage(entries);
        const publicProb =
          entries.reduce((a, b) => a + b.prob, 0) / entries.length;

        const ev = sharpProb - publicProb;
        const stability = Math.min(1, entries.length / 10);

        const score = confidenceScore({
          sharpProb,
          publicProb,
          ev,
          stability
        });

        return {
          market: key,
          bestLine: entries.sort((a, b) => b.odds - a.odds)[0],
          confidenceScore: score,
          decision: decisionGate(score),
          arrow: directionArrow(sharpProb, publicProb)
        };
      }).filter(Boolean);

      return {
        gameId: game.id,
        home: game.home_team,
        away: game.away_team,
        commence: game.commence_time,
        markets: marketViews
      };
    });

    res.status(200).json(output);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
