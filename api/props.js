// api/props.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";

// Loosened thresholds so props actually show on a public site
const PROP_MIN_PROB = 0.52;
const PROP_MIN_BOOKS = 2;
const MAX_ROWS_PER_MARKET = 24;

const BOOK_BASE = {
  pinnacle: 1.25,
  circa: 1.20,
  betcris: 1.10,
  betonlineag: 1.05,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.97,
  caesars: 0.95,
  betrivers: 0.92
};

const SHARP_BOOKS = new Set(["pinnacle", "circa", "betcris"]);

const MARKETS = [
  "player_pass_tds",
  "player_pass_attempts",
  "player_pass_completions",
  "player_rush_tds"
].join(",");

function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function calcEV(prob, odds) {
  if (prob == null || !Number.isFinite(prob) || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

function baseW(bookKey) {
  return BOOK_BASE[bookKey] ?? 0.85;
}

function noVigPair(pA, pB) {
  const total = pA + pB;
  if (!total) return [null, null];
  return [pA / total, pB / total];
}

function weightedConsensus(entries, useSharpPremium) {
  let wSum = 0;
  let pSum = 0;

  for (const e of entries) {
    if (e.prob_novig == null || !Number.isFinite(e.prob_novig)) continue;

    let w = baseW(e.book);
    if (useSharpPremium && SHARP_BOOKS.has(e.book)) w *= 1.10; // modest premium
    wSum += w;
    pSum += e.prob_novig * w;
  }

  return wSum ? pSum / wSum : null;
}

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(200).json({ markets: {} });

  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${id}/odds?regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`
    );

    const data = await r.json();

    // raw[marketKey][player||point][bookKey] = array of outcomes
    const raw = {};

    for (const book of data.bookmakers || []) {
      for (const m of book.markets || []) {
        if (!raw[m.key]) raw[m.key] = {};
        for (const o of m.outcomes || []) {
          if (!o.description) continue;

          const player = o.description;
          const point = o.point ?? null;
          const groupKey = `${player}||${point}`;

          if (!raw[m.key][groupKey]) {
            raw[m.key][groupKey] = { player, point, perBook: {} };
          }
          if (!raw[m.key][groupKey].perBook[book.key]) raw[m.key][groupKey].perBook[book.key] = [];

          raw[m.key][groupKey].perBook[book.key].push({
            name: o.name,
            odds: o.price
          });
        }
      }
    }

    const markets = {};

    for (const mk of Object.keys(raw)) {
      const rows = [];

      for (const g of Object.values(raw[mk])) {
        const sideBuckets = {};

        for (const [bookKey, outs] of Object.entries(g.perBook)) {
          if (outs.length === 2 && Number.isFinite(outs[0].odds) && Number.isFinite(outs[1].odds)) {
            const p0 = americanToProb(outs[0].odds);
            const p1 = americanToProb(outs[1].odds);
            const [nv0, nv1] = noVigPair(p0, p1);

            const o0 = { ...outs[0], prob_novig: nv0, book: bookKey };
            const o1 = { ...outs[1], prob_novig: nv1, book: bookKey };

            if (!sideBuckets[o0.name]) sideBuckets[o0.name] = [];
            if (!sideBuckets[o1.name]) sideBuckets[o1.name] = [];
            sideBuckets[o0.name].push(o0);
            sideBuckets[o1.name].push(o1);
          } else {
            for (const o of outs) {
              if (!Number.isFinite(o.odds)) continue;
              const entry = { ...o, prob_novig: americanToProb(o.odds), book: bookKey };
              if (!sideBuckets[o.name]) sideBuckets[o.name] = [];
              sideBuckets[o.name].push(entry);
            }
          }
        }

        for (const [sideName, entries] of Object.entries(sideBuckets)) {
          const bookCount =
