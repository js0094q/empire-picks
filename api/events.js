// /api/events.js — Optimized aggregation engine
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
  if (odds == null) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

/* Symmetric no-vig (Zeng–Zhang) */
function noVigSymmetric(pA, pB) {
  const denom = pA + pB - pA * pB;
  if (denom <= 0) return [0.5, 0.5];
  return [pA / denom, pB / denom];
}

function weightedFair(list) {
  const probs = list.map(x => x.p);
  const weights = list.map(x => x.w);

  const wSum = weights.reduce((a, b) => a + b, 0);
  if (!wSum) return null;

  const fair = probs.reduce((s, p, i) => s + p * weights[i], 0) / wSum;
  return fair;
}

function variance(arr) {
  if (arr.length <= 1) return 1;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.max(0.15, Math.min(1, 1 - v));  // normalized stability score
}

function edge(fair, impliedProb, stability = 1) {
  if (fair == null || impliedProb == null) return null;
  return (fair - impliedProb) * stability;
}

/* ============================================================
   WEEK FILTERING
   ============================================================ */

function inWeekWindow(utc) {
  const d = new Date(utc).toLocaleString("en-US", { timeZone: "America/New_York" });
  const dow = new Date(d).getDay();
  return [4,5,6,0,1].includes(dow); // Thu–Mon
}

function isVisible(utc) {
  const diffHours = (Date.now() - new Date(utc)) / 3600000;
  return diffHours < 4;
}

/* ============================================================
   AGGREGATOR
   ============================================================ */

function aggregateBookmakers(game) {
  const consensus = {
    h2h: { home: [], away: [] },
    spreads: { home: [], away: [] },
    totals: { over: [], under: [] }
  };

  const markets = { h2h: [], spreads: [], totals: [] };

  for (const book of game.bookmakers || []) {
    const weight = BOOK_WEIGHTS[book.key] || 1;

    for (const m of book.markets || []) {
      const key = m.key;
      if (!["h2h","spreads","totals"].includes(key)) continue;

      /* ---------------- H2H ---------------- */
      if (key === "h2h") {
        const homeO = m.outcomes.find(o => o.name === game.home_team);
        const awayO = m.outcomes.find(o => o.name === game.away_team);
        if (!homeO || !awayO) continue;

        const pH = implied(homeO.price);
        const pA = implied(awayO.price);
        const [fA, fH] = noVigSymmetric(pA, pH);

        consensus.h2h.home.push({ p: fH, w: weight });
        consensus.h2h.away.push({ p: fA, w: weight });

        markets.h2h.push({
          bookmaker: book.title,
          outcome1: {
            name: awayO.name,
            odds: awayO.price,
            implied: pA,
            fair: fA,
            edge: edge(fA, pA)
          },
          outcome2: {
            name: homeO.name,
            odds: homeO.price,
            implied: pH,
            fair: fH,
            edge: edge(fH, pH)
          }
        });
      }

      /* ---------------- SPREAD ---------------- */
      if (key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const pH = implied(h.price);
        const pA = implied(a.price);
        const [fA, fH] = noVigSymmetric(pA, pH);

        consensus.spreads.home.push({ p: fH, w: weight });
        consensus.spreads.away.push({ p: fA, w: weight });

        markets.spreads.push({
          bookmaker: book.title,
          outcome1: {
            name: a.name,
            point: a.point,
            odds: a.price,
            implied: pA,
            fair: fA,
            edge: edge(fA, pA)
          },
          outcome2: {
            name: h.name,
            point: h.point,
            odds: h.price,
            implied: pH,
            fair: fH,
            edge: edge(fH, pH)
          }
        });
      }

      /* ---------------- TOTALS ---------------- */
      if (key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        if (!over || !under) continue;

        const pO = implied(over.price);
        const pU = implied(under.price);
        const [fO, fU] = noVigSymmetric(pO, pU);

        consensus.totals.over.push({ p: fO, w: weight });
        consensus.totals.under.push({ p: fU, w: weight });

        markets.totals.push({
          bookmaker: book.title,
          outcome1: {
            name: "Over",
            point: over.point,
            odds: over.price,
            implied: pO,
            fair: fO,
            edge: edge(fO, pO)
          },
          outcome2: {
            name: "Under",
            point: under.point,
            odds: under.price,
            implied: pU,
            fair: fU,
            edge: edge(fU, pU)
          }
        });
      }
    }
  }

  /* ============================================================
     FINAL CONSENSUS & EV (Weighted + Stability)
     ============================================================ */

  function finalize(list, odds) {
    const fair = weightedFair(list);
    const impliedProb = implied(odds);
    const stability = variance(list.map(x => x.p)); // adjust EV

    return {
      consensus_prob: fair,
      ev: edge(fair, impliedProb, stability),
      stability
    };
  }

  /* build final best-line object but base EV on consensus fair prob */
  const extractBest = (mkt, selector) => {
    const rows = markets[mkt];
    if (!rows.length) return null;

    let best = null;

    for (const r of rows) {
      const o = selector(r);
      if (!best || o.odds > best.odds) best = { ...o };
    }

    const side = mkt === "spreads"
      ? (selector.name?.includes("home") ? "home" : "away")
      : mkt;

    const cons = mkt === "h2h"
      ? finalize(
          selector.name === game.home_team
            ? consensus.h2h.home
            : consensus.h2h.away,
          best.odds
        )
      : mkt === "spreads"
      ? finalize(
          selector.name === game.home_team
            ? consensus.spreads.home
            : consensus.spreads.away,
          best.odds
        )
      : finalize(
          selector.name === "Over"
            ? consensus.totals.over
            : consensus.totals.under,
          best.odds
        );

    return { ...best, ...cons };
  };

  const best = {
    ml: {
      home: extractBest("h2h", r => r.outcome2),
      away: extractBest("h2h", r => r.outcome1)
    },
    spread: {
      home: extractBest("spreads", r => r.outcome2),
      away: extractBest("spreads", r => r.outcome1)
    },
    total: {
      over: extractBest("totals", r => r.outcome1),
      under: extractBest("totals", r => r.outcome2)
    }
  };

  return { markets, best };
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */

export default async function handler(req, res) {
  try {
    const url =
      `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}` +
      `&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const r = await fetch(url);
    if (!r.ok) return res.status(500).json({ error: "Odds API failure" });

    const events = await r.json();
    const out = [];

    for (const g of events) {
      if (!inWeekWindow(g.commence_time)) continue;
      if (!isVisible(g.commence_time)) continue;

      const agg = aggregateBookmakers(g);

      out.push({
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time,
        books: agg.markets,
        best: agg.best
      });
    }

    res.status(200).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
