// api/events.js
// REAL Odds API – ALL GAMES THIS WEEK
// ML + SPREAD + TOTAL
// Sharp vs Public lean, EV, confidence
// Auto-expire 4h post kickoff
// NEVER hard-crashes

import {
  americanToProb,
  sharpWeight,
  confidenceScore,
  decisionGate,
  directionArrow
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";
const FOUR_HOURS = 4 * 60 * 60 * 1000;

function calcEV(prob, odds) {
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=60");

  try {
    const url =
      `${BASE}/sports/${SPORT}/odds` +
      `?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    const now = Date.now();

    const games = data
      .filter(g => {
        const t = new Date(g.commence_time).getTime();
        return now < t + FOUR_HOURS;
      })
      .map(g => {
        const markets = {};

        for (const bm of g.bookmakers ?? []) {
          for (const m of bm.markets ?? []) {
            if (!markets[m.key]) markets[m.key] = [];
            for (const o of m.outcomes) {
              markets[m.key].push({
                label: o.name,
                point: o.point,
                odds: o.price,
                prob: americanToProb(o.price),
                weight: sharpWeight(bm.key)
              });
            }
          }
        }

        const finalize = rows => {
          if (!rows.length) return [];

          const totalWeight = rows.reduce((a, r) => a + r.weight, 0);
          const consensus =
            rows.reduce((a, r) => a + r.prob * r.weight, 0) / totalWeight;

          return rows.map(r => {
            const ev = calcEV(consensus, r.odds);
            const lean = r.prob - consensus;
            const score = confidenceScore({
              lean,
              ev,
              bookCount: rows.length
            });

            return {
              label:
                r.point != null
                  ? `${r.label} ${r.point > 0 ? "+" : ""}${r.point}`
                  : r.label,
              odds: r.odds,
              prob: consensus,
              ev,
              lean,
              arrow: directionArrow(lean),
              confidence: score,
              decision: decisionGate(score)
            };
          });
        };

        return {
          id: g.id,
          commence_time: g.commence_time,
          home_team: g.home_team,
          away_team: g.away_team,
          markets: {
            h2h: finalize(markets.h2h || []),
            spreads: finalize(markets.spreads || []),
            totals: finalize(markets.totals || [])
          }
        };
      });

    res.status(200).json(games);
  } catch (e) {
    console.error(e);
    res.status(200).json([]);
  }
}
