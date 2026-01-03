// /api/props.js
import { removeVig, sharpWeight, calculateConfidenceScore, decisionGate, directionArrow } from "./math.js";

export default async function handler(req, res) {
  try {
    const rawProps = await fetchPropsSomehow();

    const props = rawProps.map(p => {
      const weighted = p.books.map(b => ({
        odds: b.price,
        weight: sharpWeight(b.book)
      }));

      const probs = removeVig(weighted.map(o => o.odds));
      const sharpProb = probs.reduce((a, p, i) =>
        a + p * weighted[i].weight, 0
      ) / weighted.reduce((a, o) => a + o.weight, 0);

      const publicProb = probs.reduce((a, b) => a + b, 0) / probs.length;
      const ev = sharpProb - publicProb;

      const confidenceScore = calculateConfidenceScore({
        sharpProb,
        publicProb,
        ev,
        marketWidth: p.lineRange,
        bookCount: p.books.length
      });

      return {
        propId: p.id,
        label: p.player + " " + p.type,
        line: p.line,
        confidenceScore,
        decision: decisionGate(confidenceScore),
        arrow: directionArrow(sharpProb, publicProb)
      };
    });

    res.json(props);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
