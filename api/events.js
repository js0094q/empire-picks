// /api/events.js
import {
  impliedProb,
  removeVig,
  stabilityScore,
  expectedValue,
  confidenceScore
} from "./math.js";

const SHARP_BOOKS = ["pinnacle", "betonlineag"];
const PUBLIC_BOOKS = ["fanduel", "draftkings", "betmgm", "caesars"];

const SHARP_WEIGHT = 1.6;
const PUBLIC_WEIGHT = 1.0;

function weightedProb(entries) {
  let total = 0;
  let weightSum = 0;

  for (const e of entries) {
    total += e.prob * e.weight;
    weightSum += e.weight;
  }

  return total / weightSum;
}

export default async function handler(req, res) {
  try {
    const rawGames = await fetchGamesSomehow(); // ← your existing fetch

    const output = rawGames.map(game => {
      const markets = ["ml", "spread", "total"].map(type => {
        const entries = game.markets[type] || [];
        if (!entries.length) return null;

        const probs = entries.map(e => impliedProb(e.odds));

        const stable = stabilityScore(probs);

        const sharp = entries.filter(e => SHARP_BOOKS.includes(e.book));
        const public_ = entries.filter(e => PUBLIC_BOOKS.includes(e.book));

        if (!sharp.length || !public_.length) return null;

        const sharpProb = weightedProb(
          sharp.map(e => ({
            prob: impliedProb(e.odds),
            weight: SHARP_WEIGHT
          }))
        );

        const publicProb = weightedProb(
          public_.map(e => ({
            prob: impliedProb(e.odds),
            weight: PUBLIC_WEIGHT
          }))
        );

        const lean = sharpProb - publicProb;

        const best = entries.sort(
          (a, b) => expectedValue(sharpProb, b.odds) -
                    expectedValue(sharpProb, a.odds)
        )[0];

        const ev = expectedValue(sharpProb, best.odds);

        const confidence = confidenceScore({
          lean,
          stability: stable,
          ev
        });

        return {
          type,
          side: best.side,
          odds: best.odds,
          book: best.book,
          sharpProb,
          publicProb,
          lean,
          stability: stable,
          ev,
          confidence
        };
      }).filter(Boolean);

      const bestMarket = markets.sort(
        (a, b) => b.confidence - a.confidence
      )[0];

      return {
        gameId: game.id,
        matchup: game.matchup,
        time: game.time,
        bestMarket,
        play:
          bestMarket &&
          bestMarket.confidence >= 0.55 &&
          bestMarket.stability >= 0.6
      };
    });

    res.json(output.filter(g => g.bestMarket));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
