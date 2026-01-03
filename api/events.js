import fetch from "node-fetch";
import { BASE_URL, SPORT, GAME_HIDE_HOURS } from "./config.js";
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

function isExpired(commenceTime) {
  const kickoff = new Date(commenceTime).getTime();
  return Date.now() > kickoff + GAME_HIDE_HOURS * 3600 * 1000;
}

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
        point: o.point ?? null,
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

function buildMarketView({ sharp, publicB, all }) {
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
    selection: best.name,
    point: best.point,
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
    const url =
      `${BASE_URL}/sports/${SPORT}/odds` +
      `?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API failure");

    const games = await r.json();

    const output = games
      .filter(g => !isExpired(g.commence_time))
      .map(game => {
        const ml = buildMarketView(
          splitBooks(game.bookmakers, "h2h")
        );

        const spread = buildMarketView(
          splitBooks(game.bookmakers, "spreads")
        );

        const total = buildMarketView(
          splitBooks(game.bookmakers, "totals")
        );

        return {
          id: game.id,
          home_team: game.home_team,
          away_team: game.away_team,
          commence_time: game.commence_time,
          markets: {
            ml,
            spread,
            total
          }
        };
      });

    res.status(200).json(output);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
