// /api/events.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   MATH HELPERS
   ============================================================ */

function implied(odds) {
  if (!odds && odds !== 0) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function noVigNormalize(pList) {
  const total = pList.reduce((a, c) => a + c, 0);
  if (!total) return pList.map(() => 0.5);
  return pList.map(p => p / total);
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, c) => a + c, 0) / arr.length;
}

function edge(fairProb, impliedProb) {
  if (fairProb == null || impliedProb == null) return null;
  return fairProb - impliedProb;
}

/* ============================================================
   WEEK + VISIBILITY FILTERS
   ============================================================ */

function inWeekWindow(commenceUTC) {
  const now = new Date();
  const event = new Date(commenceUTC);

  const options = { timeZone: "America/New_York" };
  const eventET = new Date(event.toLocaleString("en-US", options));

  const d = eventET.getDay(); // 0 Sun, 1 Mon, ..., 4 Thu, ...

  const isThuToSat = d >= 4 && d <= 6;
  const isSun = d === 0;
  const isMon = d === 1;

  return isThuToSat || isSun || isMon;
}

function isVisible(commenceUTC) {
  const now = new Date();
  const start = new Date(commenceUTC);
  const hours = (now - start) / (1000 * 3600);
  return hours < 4;
}

/* ============================================================
   MAIN AGGREGATION ENGINE
   ============================================================ */

function aggregateBookmakers(game) {
  const consensus = {
    h2h: { home: [], away: [] },
    spreads: { home: [], away: [] },
    totals: { over: [], under: [] }
  };

  const best = {
    ml: { home: {}, away: {} },
    spread: { home: {}, away: {} },
    total: { over: {}, under: {} }
  };

  const markets = { h2h: [], spreads: [], totals: [] };

  for (const book of game.bookmakers || []) {
    for (const m of book.markets || []) {
      const key = m.key;
      if (!["h2h", "spreads", "totals"].includes(key)) continue;

      /* -----------------------------
         MONEYLINE
      ------------------------------ */
      if (key === "h2h") {
        const homeO = m.outcomes.find(o => o.name === game.home_team);
        const awayO = m.outcomes.find(o => o.name === game.away_team);
        if (!homeO || !awayO) continue;

        const pH = implied(homeO.price);
        const pA = implied(awayO.price);
        const [fH, fA] = noVigNormalize([pH, pA]);

        consensus.h2h.home.push(fH);
        consensus.h2h.away.push(fA);

        // Store best prices
        if (!best.ml.home.odds || homeO.price > best.ml.home.odds)
          best.ml.home = { team: homeO.name, odds: homeO.price };
        if (!best.ml.away.odds || awayO.price > best.ml.away.odds)
          best.ml.away = { team: awayO.name, odds: awayO.price };

        markets.h2h.push({
          bookmaker: book.title,
          outcome1: { name: awayO.name, odds: awayO.price, implied: pA },
          outcome2: { name: homeO.name, odds: homeO.price, implied: pH }
        });
      }

      /* -----------------------------
         SPREADS
      ------------------------------ */
      if (key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const pH = implied(h.price);
        const pA = implied(a.price);
        const [fA, fH] = noVigNormalize([pA, pH]); // away first, home second

        consensus.spreads.home.push(fH);
        consensus.spreads.away.push(fA);

        if (!best.spread.home.odds || h.price > best.spread.home.odds)
          best.spread.home = { team: h.name, point: h.point, odds: h.price };
        if (!best.spread.away.odds || a.price > best.spread.away.odds)
          best.spread.away = { team: a.name, point: a.point, odds: a.price };

        markets.spreads.push({
          bookmaker: book.title,
          outcome1: { name: a.name, point: a.point, odds: a.price, implied: pA },
          outcome2: { name: h.name, point: h.point, odds: h.price, implied: pH }
        });
      }

      /* -----------------------------
         TOTALS
      ------------------------------ */
      if (key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        if (!over || !under) continue;

        const pO = implied(over.price);
        const pU = implied(under.price);
        const [fO, fU] = noVigNormalize([pO, pU]);

        consensus.totals.over.push(fO);
        consensus.totals.under.push(fU);

        if (!best.total.over.odds || over.price > best.total.over.odds)
          best.total.over = { point: over.point, odds: over.price };
        if (!best.total.under.odds || under.price > best.total.under.odds)
          best.total.under = { point: under.point, odds: under.price };

        markets.totals.push({
          bookmaker: book.title,
          outcome1: { name: "Over", point: over.point, odds: over.price, implied: pO },
          outcome2: { name: "Under", point: under.point, odds: under.price, implied: pU }
        });
      }
    }
  }

  /* -----------------------------
     FINAL CONSENSUS + EV ATTACH
  ------------------------------ */

  function attach(list, impliedPrice) {
    const cp = avg(list);
    const ip = implied(impliedPrice);
    return {
      consensus_prob: cp,
      ev: edge(cp, ip)
    };
  }

  best.ml.home = { ...best.ml.home, ...attach(consensus.h2h.home, best.ml.home.odds) };
  best.ml.away = { ...best.ml.away, ...attach(consensus.h2h.away, best.ml.away.odds) };

  best.spread.home = { ...best.spread.home, ...attach(consensus.spreads.home, best.spread.home.odds) };
  best.spread.away = { ...best.spread.away, ...attach(consensus.spreads.away, best.spread.away.odds) };

  best.total.over = { ...best.total.over, ...attach(consensus.totals.over, best.total.over.odds) };
  best.total.under = { ...best.total.under, ...attach(consensus.totals.under, best.total.under.odds) };

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
    if (!r.ok) return res.status(500).json({ error: "Odds API error" });

    const list = await r.json();
    const out = [];

    for (const g of list) {
      if (!inWeekWindow(g.commence_time)) continue;
      if (!isVisible(g.commence_time)) continue;

      const { markets, best } = aggregateBookmakers(g);

      out.push({
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time,
        books: markets,
        best
      });
    }

    res.status(200).json(out);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
