// /api/events.js — FINAL, NORMALIZED

import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

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
  pointsbetus: 0.85
};

const implied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

function noVig(pA, pB) {
  const d = pA + pB - pA * pB;
  return d > 0 ? [pA / d, pB / d] : [0.5, 0.5];
}

function weightedFair(list) {
  const w = list.reduce((s, x) => s + x.w, 0);
  return w ? list.reduce((s, x) => s + x.p * x.w, 0) / w : null;
}

function variance(arr) {
  if (arr.length < 2) return 1;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - m) ** 2, 0) / arr.length;
  return Math.max(0.15, Math.min(1, 1 - v));
}

function edge(fair, imp, stab) {
  return fair != null && imp != null ? (fair - imp) * stab : null;
}

function aggregate(game) {
  const cons = {
    h2h: { home: [], away: [] },
    spreads: { home: [], away: [] },
    totals: { over: [], under: [] }
  };

  const books = { h2h: [], spreads: [], totals: [] };

  for (const b of game.bookmakers || []) {
    const w = BOOK_WEIGHTS[b.key] || 1;

    for (const m of b.markets || []) {
      if (m.key === "h2h") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const [fA, fH] = noVig(implied(a.price), implied(h.price));

        cons.h2h.home.push({ p: fH, w });
        cons.h2h.away.push({ p: fA, w });

        books.h2h.push({
          home: { name: game.home_team, odds: h.price, fair: fH },
          away: { name: game.away_team, odds: a.price, fair: fA }
        });
      }

      if (m.key === "spreads") {
        const h = m.outcomes.find(o => o.name === game.home_team);
        const a = m.outcomes.find(o => o.name === game.away_team);
        if (!h || !a) continue;

        const [fA, fH] = noVig(implied(a.price), implied(h.price));

        cons.spreads.home.push({ p: fH, w });
        cons.spreads.away.push({ p: fA, w });

        books.spreads.push({
          home: { name: game.home_team, point: h.point, odds: h.price, fair: fH },
          away: { name: game.away_team, point: a.point, odds: a.price, fair: fA }
        });
      }

      if (m.key === "totals") {
        const o = m.outcomes.find(x => x.name === "Over");
        const u = m.outcomes.find(x => x.name === "Under");
        if (!o || !u) continue;

        const [fO, fU] = noVig(implied(o.price), implied(u.price));

        cons.totals.over.push({ p: fO, w });
        cons.totals.under.push({ p: fU, w });

        books.totals.push({
          over: { name: "Over", point: o.point, odds: o.price, fair: fO },
          under: { name: "Under", point: u.point, odds: u.price, fair: fU }
        });
      }
    }
  }

  const finalize = (list, odds) => {
    const fair = weightedFair(list);
    const stab = variance(list.map(x => x.p));
    return {
      consensus_prob: fair,
      stability: stab,
      ev: edge(fair, implied(odds), stab)
    };
  };

  const best = {
    ml: {
      home: books.h2h[0]?.home && {
        ...books.h2h[0].home,
        ...finalize(cons.h2h.home, books.h2h[0].home.odds)
      },
      away: books.h2h[0]?.away && {
        ...books.h2h[0].away,
        ...finalize(cons.h2h.away, books.h2h[0].away.odds)
      }
    },
    spread: {
      home: books.spreads[0]?.home && {
        ...books.spreads[0].home,
        ...finalize(cons.spreads.home, books.spreads[0].home.odds)
      },
      away: books.spreads[0]?.away && {
        ...books.spreads[0].away,
        ...finalize(cons.spreads.away, books.spreads[0].away.odds)
      }
    },
    total: {
      over: books.totals[0]?.over && {
        ...books.totals[0].over,
        ...finalize(cons.totals.over, books.totals[0].over.odds)
      },
      under: books.totals[0]?.under && {
        ...books.totals[0].under,
        ...finalize(cons.totals.under, books.totals[0].under.odds)
      }
    }
  };

  return { books, best };
}

export default async function handler(req, res) {
  const r = await fetch(
    `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`
  );
  const data = await r.json();

  const out = data.map(g => ({
    id: g.id,
    home_team: g.home_team,
    away_team: g.away_team,
    commence_time: g.commence_time,
    ...aggregate(g)
  }));

  res.status(200).json(out);
}
