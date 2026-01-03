// /api/props.js

import fetch from "node-fetch";
import {
  americanToProb,
  weightedAverage,
  confidenceScore,
  decisionGate,
  directionArrow
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;
const BASE = "https://api.the-odds-api.com/v4";

export default async function handler(req, res) {
  try {
    const url = `${BASE}/sports/americanfootball_nfl/odds?markets=player_pass_yds,player_rush_yds&regions=us&oddsFormat=american&apiKey=${API_KEY}`;
    const r = await fetch(url);
    const games = await r.json();

    const props = [];

    games.forEach(g => {
      g.bookmakers.forEach(b => {
        b.markets.forEach(m => {
          m.outcomes.forEach(o => {
            const sharpProb = americanToProb(o.price);
            const publicProb = 0.5;

            const score = confidenceScore({
              sharpProb,
              publicProb,
              ev: sharpProb - publicProb,
              stability: 0.6
            });

            props.push({
              label: `${o.name} ${m.key.replace("_", " ")}`,
              line: o.point,
              odds: o.price,
              confidenceScore: score,
              decision: decisionGate(score),
              arrow: directionArrow(sharpProb, publicProb)
            });
          });
        });
      });
    });

    res.status(200).json(props.filter(p => p.decision !== "PASS"));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
