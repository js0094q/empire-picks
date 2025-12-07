// /api/events.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   BOOK WEIGHTS (SHARP > PUBLIC)
   ============================================================ */

const BOOK_WEIGHTS = {
  "Pinnacle": 0.40,
  "Circa Sports": 0.30,
  "BetOnline": 0.15,

  // Public books still contribute lightly
  "FanDuel": 0.05,
  "DraftKings": 0.05,
  "BetMGM": 0.03,
  "Caesars": 0.02
};

// Default weight for unrecognized books
const DEFAULT_WEIGHT = 0.02;

/* ============================================================
   MATH HELPERS
   ============================================================ */

function implied(odds) {
  if (odds === undefined || odds === null) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function noVigNormalize(values) {
  const sum = values.reduce((a, b) => a + b, 0);
  if (!sum) return values.map(() => 0.5);
  return values.map(v => v / sum);
}

function edge(fair, implied) {
  if (fair == null || implied == null) return null;
  return fair - implied;
}

/* ============================================================
   WEEK FILTERING
   ============================================================ */

function inWeekWindow(commenceUTC) {
  const event = new Date(commenceUTC);
  const d = new Date(
    event.toLocaleString("en-US", { timeZone: "America/New_York" })
  ).getDay();
  // Thu–Mon
  return d === 4 || d === 5 || d === 6 || d === 0 || d === 1;
}

function isVisible(commenceUTC) {
  const diff = (Date.now() - new Date(commenceUTC)) / 3600000;
  return diff < 4;
}

/* ============================================================
   MAIN AGGREGATION WITH WEIGHTING
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
    const weight = BOOK_WEIGHTS[book.title] ?? DEFAULT_WEIGHT;

    for (const m of book.markets || []) {
      const key = m.key;
      if (!["h2h", "spreads", "totals"].includes(key)) continue;

      /* -------------------------------------------------------
         MONEYLINE
      -------------------------------------------------------- */
      if (key === "h2h") {
        const homeO = m.outcomes.find(o => o.name === game.home_team);
        const awayO = m.outcomes.find(o => o.name === game.away_team);
        if (!homeO || !awayO) continue;

        const impH = implied(homeO.price);
        const impA = implied(awayO.price);

        // No-vig normalized fair probs
        const [fH, fA] = noVigNormalize([impH, impA]);

        // Weighting
        consensus.h2h.home.push(fH * weight);
        consensus.h2h.away.push(fA * weight);

        // Track best lines
        if (!best.ml.home.odds || homeO.price > best.ml.home.odds)
          best.ml.home = { team: homeO.name, odds: homeO.price };

        if (!best.ml.away.odds || awayO.price > best.ml.away.odds)
          best.ml.away = { team: awayO.name, odds: awayO.price };

        // Per-book row
        markets.h2h.push({
          bookmaker: book.title,
          outcome1: {
            name: awayO.name,
            odds: awayO.price,
            implied: impA,
            fair: fA,
            edge: edge(fA, impA)
          },
          outcome2: {
            name: homeO.name,
            odds: homeO.price,
            implied: impH,
            fair: fH,
            edge: edge(fH, impH)
          }
        });
      }

      /* -------------------------------------------------------
         SPREADS
      -------------------------------------------------------- */
      if (key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const impH = implied(h.price);
        const impA = implied(a.price);

        const [fA, fH] = noVigNormalize([impA, impH]);

        consensus.spreads.home.push(fH * weight);
        consensus.spreads.away.push(fA * weight);

        if (!best.spread.home.odds || h.price > best.spread.home.odds)
          best.spread.home = { team: h.name, point: h.point, odds: h.price };

        if (!best.spread.away.odds || a.price > best.spread.away.odds)
          best.spread.away = { team: a.name, point: a.point, odds: a.price };

        markets.spreads.push({
          bookmaker: book.title,
          outcome1: {
            name: a.name,
            point: a.point,
            odds: a.price,
            implied: impA,
            fair: fA,
            edge: edge(fA, impA)
          },
          outcome2: {
            name: h.name,
            point: h.point,
            odds: h.price,
            implied: impH,
            fair: fH,
            edge: edge(fH, impH)
          }
        });
      }

      /* -------------------------------------------------------
         TOTALS
      -------------------------------------------------------- */
      if (key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        if (!over || !under) continue;

        const impO = implied(over.price);
        const impU = implied(under.price);

        const [fO, fU] = noVigNormalize([impO, impU]);

        consensus.totals.over.push(fO * weight);
        consensus.totals.under.push(fU * weight);

        if (!best.total.over.odds || over.price > best.total.over.odds)
          best.total.over = { point: over.point, odds: over.price };

        if (!best.total.under.odds || under.price > best.total.under.odds)
          best.total.under = { point: under.point, odds: under.price };

        markets.totals.push({
          bookmaker: book.title,
          outcome1: {
            name: "Over",
            point: over.point,
            odds: over.price,
            implied: impO,
            fair: fO,
            edge: edge(fO, impO)
          },
          outcome2: {
            name: "Under",
            point: under.point,
            odds: under.price,
            implied: impU,
            fair: fU,
            edge: edge(fU, impU)
          }
        });
      }
    }
  }

  /* -----------------------------------------------------------
     FINAL CONSENSUS + EV FOR BEST LINES
  ------------------------------------------------------------ */

  function weightedTotal(arr) {
    return arr.reduce((a, b) => a + b, 0);
  }

  best.ml.home = {
    ...best.ml.home,
    consensus_prob: weightedTotal(consensus.h2h.home),
    ev: edge(weightedTotal(consensus.h2h.home), implied(best.ml.home.odds))
  };

  best.ml.away = {
    ...best.ml.away,
    consensus_prob: weightedTotal(consensus.h2h.away),
    ev: edge(weightedTotal(consensus.h2h.away), implied(best.ml.away.odds))
  };

  best.spread.home = {
    ...best.spread.home,
    consensus_prob: weightedTotal(consensus.spreads.home),
    ev: edge(weightedTotal(consensus.spreads.home), implied(best.spread.home.odds))
  };

  best.spread.away = {
    ...best.spread.away,
    consensus_prob: weightedTotal(consensus.spreads.away),
    ev: edge(weightedTotal(consensus.spreads.away), implied(best.spread.away.odds))
  };

  best.total.over = {
    ...best.total.over,
    consensus_prob: weightedTotal(consensus.totals.over),
    ev: edge(weightedTotal(consensus.totals.over), implied(best.total.over.odds))
  };

  best.total.under = {
    ...best.total.under,
    consensus_prob: weightedTotal(consensus.totals.under),
    ev: edge(weightedTotal(consensus.totals.under), implied(best.total.under.odds))
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
    if (!r.ok) return res.status(500).json({ error: "Odds API Error" });

    const events = await r.json();
    const result = [];

    for (const g of events) {
      if (!inWeekWindow(g.commence_time)) continue;
      if (!isVisible(g.commence_time)) continue;

      const { markets, best } = aggregateBookmakers(g);

      result.push({
        id: g.id,
        home_team: g.home_team,
        away_team: g.away_team,
        commence_time: g.commence_time,
        books: markets,
        best
      });
    }

    res.status(200).json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
}
