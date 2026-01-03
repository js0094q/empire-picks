// api/math.js

export function americanToProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

export function removeVig(oddsArray) {
  const probs = oddsArray.map(americanToProb);
  const total = probs.reduce((a, b) => a + b, 0);
  return probs.map(p => p / total);
}

export function sharpWeight(book) {
  const sharpBooks = ["pinnacle", "circa", "betcris"];
  return sharpBooks.includes(book.toLowerCase()) ? 1.5 : 1.0;
}

export function confidenceScore({ lean, ev, bookCount }) {
  let score = 50;
  score += lean * 100;
  score += ev * 15;
  score += Math.min(bookCount, 6) * 3;
  return Math.max(0, Math.min(100, Math.round(score)));
}

export function decisionGate(score) {
  return score >= 65 ? "PLAY" : "PASS";
}

export function directionArrow(lean) {
  if (lean > 0.02) return "↑";
  if (lean < -0.02) return "↓";
  return "→";
}
