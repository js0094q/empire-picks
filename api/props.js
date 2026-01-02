// /api/props.js

import fetch from "node-fetch";
import {
  SPORT,
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

function normalizePlayer(name) {
  return name
    ?.replace(/\s+/g, " ")
    .replace(/ Jr\.?| III| II| IV| V/g, "")
    .trim();
}

export default async function handler(req, res) {
  try {
    const { id } = req.query;
    if (!id) return res.status(400).json({ error: "Missing event id" });

    const markets = [
      "player_pass_yds",
      "player_pass_tds",
      "player_rush_yds",
      "player_receptions",
      "player_reception_yds",
      "player_anytime_td"
    ];

    const url =
      `${BASE_URL}/sports/${SPORT}/events/${id}/odds` +
      `?regions=us&markets=${markets.join(",")}&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Props API failure");

    const data = await r.json();
    const event = Array.isArray(data) ? data[0] : data;

    const output = {};

    for (const b of event.bookmakers || []) {
      const weight = BOOK_WEIGHTS[b.key] || 1;

      for (const m of b.markets || []) {
        if (!output[m.key]) output[m.key] = {};

        for (const o of m.outcomes || []) {
          const player = normalizePlayer(o.description);
          const side = o.name.toLowerCase().includes("over") ? "over" : "under";
          const point = o.point ?? null;
          const key = `${player}|${point}`;

          if (!output[m.key][key]) {
            output[m.key][key] = {
              player,
              point,
              over: [],
              under: []
            };
          }

          output[m.key][key][side].push({
            p: impliedProb(o.price),
            odds: o.price,
            w: weight
          });
        }
      }
    }

    const finalized = {};

    for (const mkt in output) {
      finalized[mkt] = Object.values(output[mkt])
        .map(p => {
          if (!p.over.length || !p.under.length) return null;

          const fairOver = weightedAverage(p.over);
          const fairUnder = weightedAverage(p.under);

          const [fO, fU] = noVig(fairOver, fairUnder);

          const stab = stabilityScore([
            ...p.over.map(x => x.p),
            ...p.under.map(x => x.p)
          ]);

          return {
            player: p.player,
            point: p.point,
            over: {
              prob: fO,
              ev: expectedValue(fO, p.over[0].odds, stab),
              odds: Math.max(...p.over.map(x => x.odds))
            },
            under: {
              prob: fU,
              ev: expectedValue(fU, p.under[0].odds, stab),
              odds: Math.max(...p.under.map(x => x.odds))
            }
          };
        })
        .filter(Boolean)
        .sort((a, b) => {
          const ae = Math.max(a.over.ev, a.under.ev);
          const be = Math.max(b.over.ev, b.under.ev);
          return be - ae;
        })
        .slice(0, 3);
    }

    res.status(200).json({ markets: finalized });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
