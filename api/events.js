// api/events.js
import {
  removeVig,
  sharpWeight,
  confidenceScore,
  decisionGate,
  directionArrow
} from "./math.js";

export default async function handler(req, res) {
  try {
    const rawGames = await fetchGamesSomehow(); // your existing fetch

    const games = rawGames.map(game => {
      const weighted = game.books.map(b => ({
        prob: removeVig(b.odds)[0],
        weight: sharpWeight(b.book),
        odds: b.odds,
        book: b.book
      }));

      const sharpProb =
        weighted.reduce((a, b) => a + b.prob * b.weight, 0) /
        weighted.reduce((a, b) => a + b.weight, 0);

      const publicProb =
        weighted.reduce((a, b) => a + b.prob, 0) / weighted.length;

      const lean = sharpProb - publicProb;
      const ev = sharpProb * (Math.abs(weighted[0].odds) / 100) - (1 - sharpProb);

      const score = confidenceScore({
        lean,
        ev,
        bookCount: weighted.length
      });

      return {
        id: game.id,
        teams: game.teams,
        time: game.time,
        market: {
          type: "ML",
          selection: game.selection,
          odds: game.bestOdds,
          bestBook: game.bestBook,
          sharpProb,
          publicProb,
          lean,
          ev,
          confidenceScore: score,
          decision: decisionGate(score),
          direction: directionArrow(lean),
          badges: {
            marketLean: Math.abs(lean) > 0.03,
            bestValue: ev > 0.02,
            stability: score > 70
          }
        }
      };
    });

    res.status(200).json({ games });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
