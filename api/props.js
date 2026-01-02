import {
  BASE_URL,
  BOOK_WEIGHTS
} from "./config.js";

import {
  impliedProb,
  noVig,
  weightedAverage,
  stabilityScore,
  expectedValue
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;

export default async function handler(req, res) {
  try {
    const eventId = req.query.id;

    if (!eventId) {
      return res.status(400).json({ error: "Missing event id" });
    }

    if (!API_KEY) {
      throw new Error("Missing ODDS_API_KEY");
    }

    const url =
      `${BASE_URL}/sports/americanfootball_nfl/events/${eventId}/odds` +
      `?regions=us&markets=player_pass_yds,player_rush_yds,player_receptions` +
      `&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);

    if (!r.ok) {
      return res.status(200).json({ markets: {} });
    }

    const data = await r.json();

    if (!data.bookmakers?.length) {
      return res.status(200).json({ markets: {} });
    }

    const out = {};

    for (const book of data.bookmakers) {
      const weight = BOOK_WEIGHTS[book.key] || 1;

      for (const market of book.markets || []) {
        if (!market.outcomes?.length) continue;

        if (!out[market.key]) out[market.key] = {};

        for (const o of market.outcomes) {
          const player = o.description || o.name;
          if (!player) continue;

          if (!out[market.key][player]) {
            out[market.key][player] = {
              player,
              point: o.point,
              over: [],
              under: []
            };
          }

          const side = o.name.toLowerCase().includes("over")
            ? "over"
            : "under";

          out[market.key][player][side].push({
            odds: o.price,
            prob: impliedProb(o.price),
            w: weight
          });
        }
      }
    }

    const markets = {};

    for (const [marketKey, players] of Object.entries(out)) {
      markets[marketKey] = Object.values(players).map(p => {
        if (!p.over.length || !p.under.length) return null;

        const oFair = weightedAverage(p.over);
        const uFair = weightedAverage(p.under);
        const [fOver, fUnder] = noVig(oFair, uFair);

        const stability = stabilityScore([
          ...p.over.map(x => x.prob),
          ...p.under.map(x => x.prob)
        ]);

        return {
          player: p.player,
          point: p.point,
          over: {
            odds: p.over[0].odds,
            prob: fOver,
            ev: expectedValue(fOver, p.over[0].odds, stability)
          },
          under: {
            odds: p.under[0].odds,
            prob: fUnder,
            ev: expectedValue(fUnder, p.under[0].odds, stability)
          }
        };
      }).filter(Boolean);
    }

    res.status(200).json({ markets });
  } catch (err) {
    console.error("PROPS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
}
