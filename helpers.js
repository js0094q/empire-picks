// helpers.js — core math utilities

function impliedProbability(odds) {
  if (odds === null || odds === undefined || odds === '-' || odds === 0) return null;
  const o = Number(odds);
  if (Number.isNaN(o)) return null;
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}

function toDecimalOdds(odds) {
  const o = Number(odds);
  if (Number.isNaN(o)) return null;
  return o > 0 ? 1 + o / 100 : 1 - 100 / o;
}

function removeVig(probA, probB) {
  const total = probA + probB;
  if (!total) return { a: 0.5, b: 0.5 };
  return { a: probA / total, b: probB / total };
}

function expectedValue(odds, trueProb) {
  if (trueProb === null || trueProb === undefined) return null;
  const dec = toDecimalOdds(odds);
  if (dec === null) return null;
  return (trueProb * (dec - 1)) - (1 - trueProb);
}

function sortPropsByEV(props) {
  return props.sort((a, b) => (b.ev || 0) - (a.ev || 0));
}

function fmt(x) {
  if (x === null || x === undefined || x === '-') return '-';
  return x;
}

// expose globally
window.impliedProbability = impliedProbability;
window.toDecimalOdds = toDecimalOdds;
window.removeVig = removeVig;
window.expectedValue = expectedValue;
window.sortPropsByEV = sortPropsByEV;
window.fmt = fmt;
