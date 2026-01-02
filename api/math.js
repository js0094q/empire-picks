// /api/math.js

export function impliedProb(odds) {
  if (odds == null) return null;
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

/*
  Proper two-way no-vig
*/
export function noVig(pA, pB) {
  const denom = pA + pB - pA * pB;
  if (denom <= 0) return [0.5, 0.5];
  return [pA / denom, pB / denom];
}

export function weightedAverage(list) {
  const wSum = list.reduce((s, x) => s + x.w, 0);
  if (!wSum) return null;
  return list.reduce((s, x) => s + x.p * x.w, 0) / wSum;
}

/*
  Stability is inverse variance, clamped
*/
export function stabilityScore(values) {
  if (values.length < 2) return 0.75;

  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance =
    values.reduce((s, x) => s + (x - mean) ** 2, 0) / values.length;

  return Math.max(0.15, Math.min(1, 1 - variance * 4));
}

export function expectedValue(fairProb, odds, stability) {
  if (fairProb == null || odds == null) return null;
  return (fairProb - impliedProb(odds)) * stability;
}
