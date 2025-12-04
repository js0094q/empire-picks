export function impliedProbability(odds) {
  if (!odds || odds === "-") return null;
  const o = Number(odds);
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}

export function toDecimalOdds(odds) {
  const o = Number(odds);
  return o > 0 ? 1 + o / 100 : 1 - 100 / o;
}

export function removeVig(probA, probB) {
  const total = probA + probB;
  return { a: probA / total, b: probB / total };
}

export function expectedValue(odds, trueProb) {
  if (trueProb == null) return null;
  const dec = toDecimalOdds(odds);
  return (trueProb * (dec - 1)) - (1 - trueProb);
}

export function sortPropsByEV(props) {
  return props.sort((a, b) => (b.ev || 0) - (a.ev || 0));
}
