// ============================================================
// helpers.js — EmpirePicks v1.0 Core Math Engine
// DraftKings-Style Utility Suite
// ============================================================

// Convert American odds to implied probability (decimal 0-1)
export function impliedProbability(odds) {
  if (odds === null || odds === undefined || odds === '-' || odds === 0) return null;

  const o = Number(odds);
  if (o > 0) return 100 / (o + 100);
  return -o / (-o + 100);
}

// Convert American odds to decimal
export function toDecimalOdds(odds) {
  const o = Number(odds);
  return o > 0 ? (1 + o / 100) : (1 - 100 / o);
}

// No-vig normalization (2-outcome market)
export function removeVig(probA, probB) {
  const total = probA + probB;
  return {
    a: probA / total,
    b: probB / total
  };
}

// EV calculation: (true_prob * payout) - (false_prob)
export function expectedValue(odds, trueProb) {
  if (trueProb === null) return null;

  const dec = toDecimalOdds(odds);
  return (trueProb * (dec - 1)) - (1 - trueProb);
}

// Formats EV into a badge class + readable percentage
export function formatEV(ev) {
  if (ev === null || ev === undefined) return { text: '—', cls: '' };
  const pct = (ev * 100).toFixed(1);

  if (ev >= 0.03) return { text: `+${pct}%`, cls: 'ev-badge ev-pos' };
  if (ev >= -0.01) return { text: `${pct}%`, cls: 'ev-badge ev-neutral' };
  return { text: `${pct}%`, cls: 'ev-badge ev-neg' };
}

// Sort props by highest expected value
export function sortPropsByEV(props) {
  return props.sort((a, b) => (b.ev || 0) - (a.ev || 0));
}

// Formats numbers safely
export function fmt(x) {
  if (x === null || x === undefined) return '-';
  return x;
}
