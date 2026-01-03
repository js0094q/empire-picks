// /api/math.js

export function americanToProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

export function removeVig(probs) {
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map(p => p / sum);
}

export function weightedAverage(values) {
  const wSum = values.reduce((a, v) => a + v.weight, 0);
  return values.reduce((a, v) => a + v.prob * v.weight, 0) / wSum;
}

export function confidenceScore({ sharpProb, publicProb, ev, stability }) {
  return Math.min(
    100,
    Math.round(
      sharpProb * 40 +
      Math.abs(sharpProb - publicProb) * 100 * 30 +
      Math.max(ev, 0) * 20 +
      stability * 10
    )
  );
}

export function decisionGate(score) {
  if (score >= 70) return "PLAY";
  if (score >= 55) return "LEAN";
  return "PASS";
}

export function directionArrow(sharpProb, publicProb) {
  return sharpProb > publicProb ? "↑" : "↓";
}
