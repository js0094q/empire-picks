// api/props.js

import {
  americanToProb,
  sharpWeight,
  confidenceScore,
  decisionGate
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

const MARKETS = [
  "player_pass_yds",
  "player_rush_yds",
  "player_receptions",
  "player_pass_tds",
  "player_pass_attempts",
  "player_pass_completions",
  "player_rush_tds"
].join(",");

function calcEV(prob, odds) {
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing event id" });

  res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");

  try {
    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds` +
      `?regions=us&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    const markets = {};

    for (const bm of data.bookmakers ?? []) {
      for (const m of bm.markets ?? []) {
        if (!markets[m.key]) markets[m.key] = {};

        for (const o of m.outcomes) {
          const player = o.description;
          if (!player) continue;

          if (!markets[m.key][player]) {
            markets[m.key][player] = {
              player,
              point: o.point,
              over: [],
              under: []
            };
          }

          const side = o.name.toLowerCase();
          markets[m.key][player][side].push({
            odds: o.price,
            prob: americanToProb(o.price),
            weight: sharpWeight(bm.key)
          });
        }
      }
    }

    const out = {};

    for (const [mk, players] of Object.entries(markets)) {
      out[mk] = [];

      for (const p of Object.values(players)) {
        for (const side of ["over", "under"]) {
          if (!p[side].length) {
            p[side] = null;
            continue;
          }

          const totalWeight = p[side].reduce((a, r) => a + r.weight, 0);
          const consensus =
            p[side].reduce((a, r) => a + r.prob * r.weight, 0) / totalWeight;

          const best = p[side].sort(
            (a, b) => calcEV(consensus, b.odds) - calcEV(consensus, a.odds)
          )[0];

          const ev = calcEV(consensus, best.odds);
          const lean = best.prob - consensus;

          const score = confidenceScore({
            lean,
            ev,
            bookCount: p[side].length
          });

          p[side] = {
            odds: best.odds,
            prob: consensus,
            ev,
            confidence: score,
            decision: decisionGate(score)
          };
        }

        out[mk].push(p);
      }
    }

    res.status(200).json({ markets: out });
  } catch (e) {
    console.error(e);
    res.status(200).json({ markets: {} });
  }
}
