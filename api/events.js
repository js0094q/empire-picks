// /api/events.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

// --------------------------------------------
// Odds Math
// --------------------------------------------
function implied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

function noVig(pList) {
  const sum = pList.reduce((a, c) => a + c, 0);
  return pList.map(p => p / sum);
}

function edge(fair, implied) {
  return fair - implied;
}

function pct(x) {
  return +(x * 100).toFixed(1);
}

// --------------------------------------------
// NFL Week Window: Thursday → Monday
// --------------------------------------------
function inWeekWindow(commenceUTC) {
  const now = new Date();
  const event = new Date(commenceUTC);

  // Convert boundaries to ET
  const options = { timeZone: "America/New_York" };

  const nowET = new Date(now.toLocaleString("en-US", options));
  const eventET = new Date(event.toLocaleString("en-US", options));

  const day = eventET.getDay(); // 0 Sun, 1 Mon, ..., 4 Thu, ...

  // Show Thu (4) → Mon (1 next week)
  const isThuToSat = day >= 4 && day <= 6; // Thu (4), Fri (5), Sat (6)
  const isSunday = day === 0;
  const isMonday = day === 1;

  return isThuToSat || isSunday || isMonday;
}

// Hide games 4 hours after kickoff
function isVisible(commenceUTC) {
  const start = new Date(commenceUTC);
  const now = new Date();
  const diffHours = (now - start) / 1000 / 3600;
  return diffHours < 4;
}

// --------------------------------------------
// Build Market Aggregation
// --------------------------------------------
function aggregateBookmakers(game) {
  const markets = { h2h: [], spreads: [], totals: [] };

  // For consensus calculations
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

  for (const book of game.bookmakers || []) {
    for (const m of book.markets || []) {
      if (!["h2h", "spreads", "totals"].includes(m.key)) continue;

      if (m.key === "h2h") {
        const oHome = m.outcomes.find(o => o.name === game.home_team);
        const oAway = m.outcomes.find(o => o.name === game.away_team);
        if (!oHome || !oAway) continue;

        const pHome = implied(oHome.price);
        const pAway = implied(oAway.price);

        // No-vig
        const [fHome, fAway] = noVig([pHome, pAway]);

        consensus.h2h.home.push(fHome);
        consensus.h2h.away.push(fAway);

        // Best price tracking
        if (!best.ml.home.odds || oHome.price > best.ml.home.odds)
          best.ml.home = { team: oHome.name, odds: oHome.price };
        if (!best.ml.away.odds || oAway.price > best.ml.away.odds)
          best.ml.away = { team: oAway.name, odds: oAway.price };
      }

      if (m.key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const pH = implied(h.price);
        const pA = implied(a.price);
        const [fH, fA] = noVig([pA, pH]); // A first if away is underdog

        consensus.spreads.home.push(fH);
        consensus.spreads.away.push(fA);

        if (!best.spread.home.odds || h.price > best.spread.home.odds)
          best.spread.home = { team: h.name, point: h.point, odds: h.price };
        if (!best.spread.away.odds || a.price > best.spread.away.odds)
          best.spread.away = { team: a.name, point: a.point, odds: a.price };
      }

      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        if (!over || !under) continue;

        const pO = implied(over.price);
        const pU = implied(under.price);

        const [fO, fU] = noVig([pO, pU]);

        consensus.totals.over.push(fO);
        consensus.totals.under.push(fU);

        if (!best.total.over.odds || over.price > best.total.over.odds)
          best.total.over = { point: over.point, odds: over.price };
        if (!best.total.under.odds || under.price > best.total.under.odds)
          best.total.under = { point: under.point, odds: under.price };
      }
    }
  }

  // Compute final consensus + EV
  function avg(arr) {
    if (!arr.length) return null;
    return arr.reduce((a, b) => a + b, 0) / arr.length;
  }

  // Attach consensus + EV
  const attachEV = (obj, consProbKey, impliedOdds) => {
    const cp = consProbKey; // consensus probability
    const imp = implied(impliedOdds || 0);
    return {
      ...obj,
      consensus_prob: cp,
      ev: cp - imp
    };
  };

  best.ml.home = attachEV(best.ml.home, avg(consensus.h2h.home), best.ml.home.odds);
  best.ml.away = attachEV(best.ml.away, avg(consensus.h2h.away), best.ml.away.odds);

  best.spread.home = attachEV(best.spread.home, avg(consensus.spreads.home), best.spread.home.odds);
  best.spread.away = attachEV(best.spread.away, avg(consensus.spreads.away), best.spread.away.odds);

  best.total.over = attachEV(best.total.over, avg(consensus.totals.over), best.total.over.odds);
  best.total.under = attachEV(best.total.under, avg(consensus.totals.under), best.total.under.odds);

  return { markets, best };
}

        // Best prices (best underdog/favorite value)
        if (!best.ml[o1.name.toLowerCase()] ||
            o1.price > best.ml[o1.name.toLowerCase()].odds) {
          best.ml[o1.name.toLowerCase()] = { team: o1.name, odds: o1.price };
        }
        if (!best.ml[o2.name.toLowerCase()] ||
            o2.price > best.ml[o2.name.toLowerCase()].odds) {
          best.ml[o2.name.toLowerCase()] = { team: o2.name, odds: o2.price };
        }
      }

      if (m.key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const pH = implied(h.price);
        const pA = implied(a.price);

        const [fH, fA] = noVig([pH, pA]);

        markets.spreads.push({
          bookmaker: book.title,
          outcome1: { name: a.name, point: a.point, odds: a.price, edge: fA - pA, implied: pA },
          outcome2: { name: h.name, point: h.point, odds: h.price, edge: fH - pH, implied: pH }
        });

        if (!best.spread[a.name.toLowerCase()] ||
            a.price > best.spread[a.name.toLowerCase()].odds) {
          best.spread[a.name.toLowerCase()] = { team: a.name, point: a.point, odds: a.price };
        }
        if (!best.spread[h.name.toLowerCase()] ||
            h.price > best.spread[h.name.toLowerCase()].odds) {
          best.spread[h.name.toLowerCase()] = { team: h.name, point: h.point, odds: h.price };
        }
      }

      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        if (!over || !under) continue;

        const pO = implied(over.price);
        const pU = implied(under.price);
        const [fO, fU] = noVig([pO, pU]);

        markets.totals.push({
          bookmaker: book.title,
          outcome1: { name: "Over", point: over.point, odds: over.price, implied: pO, edge: fO - pO },
          outcome2: { name: "Under", point: under.point, odds: under.price, implied: pU, edge: fU - pU }
        });

        if (!best.total.over.odds || over.price > best.total.over.odds) {
          best.total.over = { point: over.point, odds: over.price };
        }
        if (!best.total.under.odds || under.price > best.total.under.odds) {
          best.total.under = { point: under.point, odds: under.price };
        }
      }
    }
  }

  return { markets, best };
}

// --------------------------------------------
// Main Handler
// --------------------------------------------
export default async function handler(req, res) {
  try {
    const url = `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;
    const r = await fetch(url);

    if (!r.ok) {
      return res.status(500).json({ error: "Odds API error" });
    }

    const json = await r.json();
    const out = [];

    for (const g of json) {
      if (!inWeekWindow(g.commence_time)) continue;
      if (!isVisible(g.commence_time)) continue;

      const { markets, best } = aggregateBookmakers(g);

      out.push({
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time,
        books: {
          h2h: markets.h2h,
          spreads: markets.spreads,
          totals: markets.totals
        },
        best: {
          ml: {
            home: best.ml[g.home_team.toLowerCase()] || {},
            away: best.ml[g.away_team.toLowerCase()] || {}
          },
          spread: {
            home: best.spread[g.home_team.toLowerCase()] || {},
            away: best.spread[g.away_team.toLowerCase()] || {}
          },
          total: best.total
        }
      });
    }

    res.status(200).json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
