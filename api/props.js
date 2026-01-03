import fetch from "node-fetch";
import { BASE_URL, SPORT } from "./config.js";
import {
  impliedProb,
  noVig,
  weightedAverage,
  expectedValue,
  stabilityScore
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;

const SHARP_BOOKS = ["pinnacle", "circa", "betonlineag"];
const PUBLIC_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars", "betrivers"];

function splitBooks(bookmakers, marketKey) {
  const sharp = [];
  const publicB = [];
  const all = [];

  for (const b of bookmakers) {
    const market = b.markets.find(m => m.key === marketKey);
    if (!market) continue;

    for (const o of market.outcomes) {
      const entry = {
        name: o.name,
        odds: o.price,
        prob: impliedProb(o.price),
        book: b.key
      };

      all.push(entry);
      if (SHARP_BOOKS.includes(b.key)) sharp.push(entry);
      if (PUBLIC_BOOKS.includes(b.key)) publicB.push(entry);
    }
  }

  return { sharp, publicB, all };
}

function buildPropView({ sharp, publicB, all }, label) {
  if (sharp.length < 2 || publicB.length < 2) return null;

  const sharpFair = weightedAverage(sharp);
  const publicFair = weightedAverage(publicB);

  const [_, sharpProb] = noVig(publicFair, sharpFair);

  const best = all.sort((a, b) => b.odds - a.odds)[0];

  const stability = stabilityScore([
    ...sharp.map(x => x.prob),
    ...publicB.map(x => x.prob)
  ]);

  const ev = expectedValue(sharpProb, best.odds, stability);
  const sharpLean = sharpProb - publicFair;

  return {
    label,
    side: best.name,
    odds: best.odds,

    sharp_prob: sharpProb,
    public_prob: publicFair,
    sharp_lean: sharpLean,

    ev,
    stability
  };
}

export default async function handler(req, res) {
  try {
    const gameId = req.query.id;
    if (!gameId) {
      return res.status(400).json({ error: "Missing game id" });
    }

    const url =
      `${BASE_URL}/sports/${SPORT}/events/${gameId}/odds` +
      `?regions=us&markets=player_pass_yds,player_rush_yds,player_receptions,player_rec_yds` +
      `&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API failure");

    const data = await r.json();
    const bookmakers = data.bookmakers ?? [];

    const output = [];

    for (const market of bookmakers.flatMap(b => b.markets)) {
      const key = market.key;
      if (!key.startsWith("player_")) continue;

      const over = buildPropView(
        splitBooks(bookmakers, key).sharp.filter(o => o.name === "Over"),
        "OVER"
      );

      const under = buildPropView(
        splitBooks(bookmakers, key).sharp.filter(o => o.name === "Under"),
        "UNDER"
      );

      if (!over || !under) continue;

      const best = over.ev > under.ev ? over : under;

      // AUTO-HIDE RULES
      if (best.stability < 0.65) continue;
      if (Math.abs(best.sharp_lean) < 0.03) continue;
      if (best.ev < 0.015) continue;

      output.push({
        market: key,
        player: market.outcomes[0]?.description ?? "Unknown",

        ...best,

        decision:
          best.ev >= 0.02 && best.stability >= 0.75
            ? "PLAY"
            : "PASS",

        confidence:
          best.ev >= 0.03 && best.stability >= 0.8
            ? "HIGH"
            : "MEDIUM"
      });
    }

    res.status(200).json(output);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
