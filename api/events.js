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
  const best = {
    ml: { home: {}, away: {} },
    spread: { home: {}, away: {} },
    total: { over: {}, under: {} }
  };

  for (const book of game.bookmakers || []) {
    for (const m of book.markets || []) {
      if (!["h2h", "spreads", "totals"].includes(m.key)) continue;

      if (m.key === "h2h") {
        if (m.outcomes.length < 2) continue;
        const o1 = m.outcomes[0];
        const o2 = m.outcomes[1];

        const p1 = implied(o1.price);
        const p2 = implied(o2.price);

        const [f1, f2] = noVig([p1, p2]);

        const row = {
          bookmaker: book.title,
          outcome1: {
            name: o1.name,
            odds: o1.price,
            implied: p1,
            fair: f1,
            edge: f1 - p1
          },
          outcome2: {
            name: o2.name,
            odds: o2.price,
            implied: p2,
            fair: f2,
            edge: f2 - p2
          }
        };

        markets.h2h.push(row);

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