// api/props.js
import {
  removeVig,
  sharpWeight,
  confidenceScore,
  decisionGate,
  directionArrow
} from "./math.js";

export default async function handler(req, res) {
  try {
    const rawProps = await fetchPropsSomehow();

    const props = rawProps.map(p => {
      const weighted = p.books.map(b => ({
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
        id: p.id,
        player: p.player,
        market: p.market,
        line: p.line,
        odds: p.bestOdds,
        bestBook: p.bestBook,
        sharpProb,
        publicProb,
        lean,
        ev,
        confidenceScore: score,
        decision: decisionGate(score),
        direction: directionArrow(lean)
      };
    });

    res.status(200).json({ props });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
