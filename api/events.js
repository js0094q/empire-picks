import {
  SPORT,
  BASE_URL,
  BOOK_WEIGHTS,
  GAME_HIDE_HOURS
} from "./config.js";

import {
  impliedProb,
  noVig,
  weightedAverage,
  stabilityScore,
  expectedValue
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;

function isExpired(commenceTime) {
  const kickoff = new Date(commenceTime).getTime();
  const cutoff = kickoff + GAME_HIDE_HOURS * 3600 * 1000;
  return Date.now() > cutoff;
}

function aggregateMarket(bookmakers, marketKey) {
  const buckets = {};

  for (const b of bookmakers || []) {
    const weight = BOOK_WEIGHTS[b.key] || 1;
    const market = b.markets?.find(m => m.key === marketKey);
    if (!market) continue;

    if (!buckets[b.key]) buckets[b.key] = [];

    for (const o of market.outcomes || []) {
      buckets[b.key].push({
        name: o.name,
        point: o.point ?? null,
        odds: o.price,
        prob: impliedProb(o.price),
        w: weight
      });
    }
  }

  return buckets;
}

export default async function handler(req, res) {
  try {
    if (!API_KEY) throw new Error("Missing ODDS_API_KEY");

    const url =
      `${BASE_URL}/sports/${SPORT}/odds` +
      `?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error(`Odds API failed: ${r.status}`);

    const games = await r.json();

    const output = games
      .filter(g => !isExpired(g.commence_time))
      .map(g => ({
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time,
        markets: {
          h2h: aggregateMarket(g.bookmakers, "h2h"),
          spreads: aggregateMarket(g.bookmakers, "spreads"),
          totals: aggregateMarket(g.bookmakers, "totals")
        }
      }));

    res.status(200).json(output);
  } catch (err) {
    console.error("EVENTS ERROR:", err.message);
    res.status(500).json({ error: err.message });
  }
}
