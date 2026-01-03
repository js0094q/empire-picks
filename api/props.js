// /api/props.js
import {
  impliedProb,
  stabilityScore,
  expectedValue,
  confidenceScore
} from "./math.js";

const SHARP_BOOKS = ["pinnacle", "betonlineag"];
const PUBLIC_BOOKS = ["fanduel", "draftkings"];

export default async function handler(req, res) {
  try {
    const rawProps = await fetchPropsSomehow();

    const output = rawProps.map(prop => {
      const entries = prop.lines || [];
      if (entries.length < 3) return null;

      const probs = entries.map(e => impliedProb(e.odds));
      const stability = stabilityScore(probs);

      const sharp = entries.filter(e => SHARP_BOOKS.includes(e.book));
      const public_ = entries.filter(e => PUBLIC_BOOKS.includes(e.book));

      if (!sharp.length || !public_.length) return null;

      const sharpProb =
        sharp.reduce((a, b) => a + impliedProb(b.odds), 0) / sharp.length;

      const publicProb =
        public_.reduce((a, b) => a + impliedProb(b.odds), 0) / public_.length;

      const lean = sharpProb - publicProb;

      const best = entries.sort(
        (a, b) => expectedValue(sharpProb, b.odds) -
                  expectedValue(sharpProb, a.odds)
      )[0];

      const ev = expectedValue(sharpProb, best.odds);

      const confidence = confidenceScore({
        lean,
        stability,
        ev
      });

      return {
        propId: prop.id,
        player: prop.player,
        market: prop.market,
        side: best.side,
        odds: best.odds,
        book: best.book,
        lean,
        stability,
        ev,
        confidence,
        direction: lean > 0 ? "sharp" : "public",
        play:
          confidence >= 0.6 &&
          stability >= 0.65 &&
          ev >= 0.04
      };
    });

    res.json(output.filter(p => p && p.play));
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
