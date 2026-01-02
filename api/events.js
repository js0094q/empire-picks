// /api/events.js

import fetch from "node-fetch";
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

function selectBestPrice(entries, side) {
  return entries
    .map(e => e[side])
    .filter(Boolean)
    .sort((a, b) => {
      if (side === "over" || side === "home") return b.odds - a.odds;
      return b.odds - a.odds;
    })[0] || null;
}

function aggregateMarket(bookmakers, marketKey, game) {
  const buckets = {};

  for (const b of bookmakers) {
    const weight = BOOK_WEIGHTS[b.key] || 1;
    const market = b.markets.find(m => m.key === marketKey);
    if (!market) continue;

    if (!buckets[b.key]) buckets[b.key] = [];

    for (const o of market.outcomes) {
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

function finalizeTwoWay(homeList, awayList) {
  const homeFair = weightedAverage(homeList);
  const awayFair = weightedAverage(awayList);

  const [fAway, fHome] = noVig(awayFair, homeFair);

  const stability = stabilityScore([
    ...homeList.map(x => x.p),
    ...awayList.map(x => x.p)
  ]);

  return {
    home: {
      consensus_prob: fHome,
      stability,
      ev: expectedValue(fHome, homeList[0]?.odds, stability)
    },
    away: {
      consensus_prob: fAway,
      stability,
      ev: expectedValue(fAway, awayList[0]?.odds, stability)
    }
  };
}

export default async function handler(req, res) {
  try {
    const url =
      `${BASE_URL}/sports/${SPORT}/odds` +
      `?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API failure");

    const games = await r.json();

    const output = games
      .filter(g => !isExpired(g.commence_time))
      .map(game => {
        const h2h = aggregateMarket(game.bookmakers, "h2h", game);
        const spreads = aggregateMarket(game.bookmakers, "spreads", game);
        const totals = aggregateMarket(game.bookmakers, "totals", game);

        return {
          id: game.id,
          home_team: game.home_team,
          away_team: game.away_team,
          commence_time: game.commence_time,
          markets: {
            h2h,
            spreads,
            totals
          }
        };
      });

    res.status(200).json(output);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
