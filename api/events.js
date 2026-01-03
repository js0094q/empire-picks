// /api/events.js
import { removeVig, sharpWeight, calculateConfidenceScore, decisionGate, directionArrow } from "./math.js";

export default async function handler(req, res) {
  try {
    const rawGames = await fetchGamesSomehow(); // your existing Odds API call

    const games = rawGames.map(game => {
      const odds = game.books.flatMap(b =>
        b.markets.find(m => m.key === "h2h")?.outcomes || []
      );

      const weighted = odds.map(o => ({
        odds: o.price,
        weight: sharpWeight(o.book)
      }));

      const probs = removeVig(weighted.map(o => o.odds));

      const sharpProb = probs.reduce((a, p, i) =>
        a + p * weighted[i].weight, 0
      ) / weighted.reduce((a, o) => a + o.weight, 0);

      const publicProb = probs.reduce((a, b) => a + b, 0) / probs.length;

      const ev = sharpProb - publicProb;
      const marketWidth = Math.max(...weighted.map(o => o.odds)) -
                          Math.min(...weighted.map(o => o.odds));

      const confidenceScore = calculateConfidenceScore({
        sharpProb,
        publicProb,
        ev,
        marketWidth,
        bookCount: game.books.length
      });

      return {
        gameId: game.id,
        matchup: game.home + " vs " + game.away,
        market: "ML",
        sharpProb,
        publicProb,
        ev,
        confidenceScore,
        decision: decisionGate(confidenceScore),
        arrow: directionArrow(sharpProb, publicProb)
      };
    });

    res.json(games);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
