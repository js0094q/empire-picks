// /api/events_nhl.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "icehockey_nhl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   BOOK WEIGHTS (NHL)
   ============================================================ */

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.3,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9
};

/* ============================================================
   HELPERS
   ============================================================ */

const implied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

function noVig(pA, pB) {
  const sum = pA + pB;
  return sum ? [pA / sum, pB / sum] : [0.5, 0.5];
}

function weightedFair(list) {
  const w = list.reduce((s, x) => s + x.w, 0);
  return w ? list.reduce((s, x) => s + x.p * x.w, 0) / w : null;
}

function stability(arr) {
  if (arr.length < 2) return 0.75;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.max(0.55, Math.min(0.95, 1 - v * 3));
}

function ev(fair, odds, stab) {
  return fair != null ? (fair - implied(odds)) * stab : null;
}

/* ============================================================
   AGGREGATION
   ============================================================ */

function aggregate(game) {
  const cons = {
    h2h: { home: [], away: [] },
    puck: { home: [], away: [] },
    totals: { over: [], under: [] }
  };

  const books = { h2h: [], puck: [], totals: [] };

  for (const b of game.bookmakers || []) {
    const w = BOOK_WEIGHTS[b.key] || 1;

    for (const m of b.markets || []) {

      /* MONEYLINE */
      if (m.key === "h2h") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const [fA, fH] = noVig(implied(a.price), implied(h.price));

        cons.h2h.home.push({ p: fH, w });
        cons.h2h.away.push({ p: fA, w });

        books.h2h.push({
          home: { odds: h.price, fair: fH },
          away: { odds: a.price, fair: fA }
        });
      }

      /* PUCK LINE */
      if (m.key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const [fA, fH] = noVig(implied(a.price), implied(h.price));

        cons.puck.home.push({ p: fH, w });
        cons.puck.away.push({ p: fA, w });

        books.puck.push({
          home: { odds: h.price, point: h.point, fair: fH },
          away: { odds: a.price, point: a.point, fair: fA }
        });
      }

      /* TOTALS */
      if (m.key === "totals") {
        const o = m.outcomes.find(x => x.name === "Over");
        const u = m.outcomes.find(x => x.name === "Under");
        if (!o || !u) continue;

        const [fO, fU] = noVig(implied(o.price), implied(u.price));

        cons.totals.over.push({ p: fO, w });
        cons.totals.under.push({ p: fU, w });

        books.totals.push({
          over: { odds: o.price, point: o.point, fair: fO },
          under: { odds: u.price, point: u.point, fair: fU }
        });
      }
    }
  }

  const finalize = (list, odds) => {
    const fair = weightedFair(list);
    const stab = stability(list.map(x => x.p));
    return { consensus_prob: fair, stability: stab, ev: ev(fair, odds, stab) };
  };

  return {
    best: {
      ml: {
        home: { ...books.h2h[0]?.home, ...finalize(cons.h2h.home, books.h2h[0]?.home.odds) },
        away: { ...books.h2h[0]?.away, ...finalize(cons.h2h.away, books.h2h[0]?.away.odds) }
      },
      puck: {
        home: { ...books.puck[0]?.home, ...finalize(cons.puck.home, books.puck[0]?.home.odds) },
        away: { ...books.puck[0]?.away, ...finalize(cons.puck.away, books.puck[0]?.away.odds) }
      },
      total: {
        over: { ...books.totals[0]?.over, ...finalize(cons.totals.over, books.totals[0]?.over.odds) },
        under: { ...books.totals[0]?.under, ...finalize(cons.totals.under, books.totals[0]?.under.odds) }
      }
    }
  };
}

export default async function handler(req, res) {
  const r = await fetch(
    `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`
  );

  const data = await r.json();

  res.status(200).json(
    data.map(g => ({
      id: g.id,
      home_team: g.home_team,
      away_team: g.away_team,
      commence_time: g.commence_time,
      ...aggregate(g)
    }))
  );
}
