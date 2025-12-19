// /api/events.js — Corrected aggregation engine
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   SHARP / PUBLIC BOOK WEIGHTING
   ============================================================ */

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
  bovada: 1.1,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85,
  barstool: 0.8,
  pointsbetus: 0.85,
  twinspires: 0.75
};

/* ============================================================
   HELPERS
   ============================================================ */

function implied(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function noVigSymmetric(pA, pB) {
  const denom = pA + pB;
  return denom > 0 ? [pA / denom, pB / denom] : [0.5, 0.5];
}

function weightedAvg(list) {
  const wSum = list.reduce((s, x) => s + x.w, 0);
  if (!wSum) return null;
  return list.reduce((s, x) => s + x.p * x.w, 0) / wSum;
}

function stabilityScore(list) {
  if (list.length < 2) return 0.5;
  const mean = list.reduce((a, b) => a + b, 0) / list.length;
  const v = list.reduce((s, x) => s + (x - mean) ** 2, 0) / list.length;
  return Math.max(0.5, Math.min(1, 1 - v * 4));
}

function ev(fair, odds, stability) {
  const p = implied(odds);
  return (fair - p) * stability;
}

/* ============================================================
   AGGREGATOR
   ============================================================ */

function aggregateBookmakers(game) {
  const accum = {
    ml: { home: [], away: [] },
    spread: { home: [], away: [] },
    total: { over: [], under: [] }
  };

  const bestOdds = {
    ml: { home: null, away: null },
    spread: { home: null, away: null },
    total: { over: null, under: null }
  };

  for (const book of game.bookmakers || []) {
    const w = BOOK_WEIGHTS[book.key] || 1;

    for (const m of book.markets || []) {
      if (m.key === "h2h") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const pH = implied(h.price);
        const pA = implied(a.price);
        const [fH, fA] = noVigSymmetric(pH, pA);

        accum.ml.home.push({ p: fH, w });
        accum.ml.away.push({ p: fA, w });

        if (!bestOdds.ml.home || h.price > bestOdds.ml.home.price)
          bestOdds.ml.home = h;
        if (!bestOdds.ml.away || a.price > bestOdds.ml.away.price)
          bestOdds.ml.away = a;
      }

      if (m.key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const pH = implied(h.price);
        const pA = implied(a.price);
        const [fH, fA] = noVigSymmetric(pH, pA);

        accum.spread.home.push({ p: fH, w });
        accum.spread.away.push({ p: fA, w });

        if (!bestOdds.spread.home || h.price > bestOdds.spread.home.price)
          bestOdds.spread.home = h;
        if (!bestOdds.spread.away || a.price > bestOdds.spread.away.price)
          bestOdds.spread.away = a;
      }

      if (m.key === "totals") {
        const o = m.outcomes.find(x => x.name === "Over");
        const u = m.outcomes.find(x => x.name === "Under");
        if (!o || !u) continue;

        const pO = implied(o.price);
        const pU = implied(u.price);
        const [fO, fU] = noVigSymmetric(pO, pU);

        accum.total.over.push({ p: fO, w });
        accum.total.under.push({ p: fU, w });

        if (!bestOdds.total.over || o.price > bestOdds.total.over.price)
          bestOdds.total.over = o;
        if (!bestOdds.total.under || u.price > bestOdds.total.under.price)
          bestOdds.total.under = u;
      }
    }
  }

  function finalize(side, odds) {
    const fair = weightedAvg(side);
    const stability = stabilityScore(side.map(x => x.p));
    return {
      consensus_prob: fair,
      ev: ev(fair, odds.price, stability),
      odds: odds.price,
      point: odds.point
    };
  }

  return {
    best: {
      ml: {
        home: finalize(accum.ml.home, bestOdds.ml.home),
        away: finalize(accum.ml.away, bestOdds.ml.away)
      },
      spread: {
        home: finalize(accum.spread.home, bestOdds.spread.home),
        away: finalize(accum.spread.away, bestOdds.spread.away)
      },
      total: {
        over: finalize(accum.total.over, bestOdds.total.over),
        under: finalize(accum.total.under, bestOdds.total.under)
      }
    }
  };
}

/* ============================================================
   HANDLER
   ============================================================ */

export default async function handler(req, res) {
  try {
    const url =
      `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}` +
      `&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API failure");

    const events = await r.json();

    const out = events.map(g => ({
      id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      commence_time: g.commence_time,
      ...aggregateBookmakers(g)
    }));

    res.status(200).json(out);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
