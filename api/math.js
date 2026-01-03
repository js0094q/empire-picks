// /api/math.js

export function removeVig(oddsArray) {
  const probs = oddsArray.map(o => {
    if (o > 0) return 100 / (o + 100);
    return Math.abs(o) / (Math.abs(o) + 100);
  });
  const total = probs.reduce((a, b) => a + b, 0);
  return probs.map(p => p / total);
}

export function sharpWeight(book) {
  const sharpBooks = ["pinnacle", "circa", "betcris"];
  if (sharpBooks.includes(book)) return 1.5;
  return 1.0;
}

export function calculateConfidenceScore({
  sharpProb,
  publicProb,
  ev,
  marketWidth,
  bookCount
}) {
  const lean = Math.abs(sharpProb - publicProb);
  const stability = Math.max(0, 1 - marketWidth / 20);
  const evScore = Math.min(Math.max(ev * 5, -1), 1);

  const score =
    lean * 40 +
    stability * 30 +
    evScore * 20 +
    Math.min(bookCount / 10, 1) * 10;

  return Math.round(Math.min(Math.max(score, 0), 100));
}

export function decisionGate(score) {
  if (score >= 75) return "PLAY";
  if (score >= 60) return "LEAN";
  return "PASS";
}

export function directionArrow(sharpProb, publicProb) {
  if (sharpProb - publicProb > 0.03) return "UP";
  if (publicProb - sharpProb > 0.03) return "DOWN";
  return "FLAT";
}
