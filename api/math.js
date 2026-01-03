// /api/math.js

// ---------- Odds & Probability ----------

export function impliedProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

export function removeVig(probA, probB) {
  const total = probA + probB;
  return {
    a: probA / total,
    b: probB / total
  };
}

// ---------- Stability (SINGLE FUNCTION) ----------
// Measures dispersion across books
// 1.0 = perfect agreement, 0 = chaos

export function stabilityScore(probabilities) {
  if (probabilities.length < 2) return 0;

  const mean =
    probabilities.reduce((a, b) => a + b, 0) / probabilities.length;

  const variance =
    probabilities.reduce((sum, p) => sum + Math.pow(p - mean, 2), 0) /
    probabilities.length;

  return Math.max(0, 1 - variance * 400);
}

// ---------- Expected Value ----------

export function expectedValue(prob, odds) {
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

// ---------- Confidence Score ----------
// Single composite metric used everywhere

export function confidenceScore({ lean, stability, ev }) {
  return (
    Math.abs(lean) * 0.45 +
    stability * 0.35 +
    Math.max(0, ev) * 0.20
  );
}
