// /api/props.js — Optimized props consensus engine
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85
};

/* HELPERS */

function implied(odds) {
  if (odds == null) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function symmetricNoVig(a, b) {
  const denom = a + b - a * b;
  if (denom <= 0) return [0.5, 0.5];
  return [a / denom, b / denom];
}

function weightedFair(arr) {
  const weights = arr.map(x => x.w);
  const probs = arr.map(x => x.p);
  const wSum = weights.reduce((a, c) => a + c, 0);
  if (!wSum) return null;
  return probs.reduce((s, p, i) => s + p * weights[i], 0) / wSum;
}

function variance(arr) {
  if (arr.length <= 1) return 1;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.max(0.15, Math.min(1, 1 - v));
}

function edge(fair, imp, stability = 1) {
  if (fair == null || imp == null) return null;
  return (fair - imp) * stability;
}

function normalizePlayer(n) {
  if (!n) return "Unknown";
  return n.replace(/\s+/g, " ")
          .replace(/ Jr\.?| III| II| IV| V/g, "")
          .trim();
}

function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

/* CATEGORY MAPPING */

function catKey(k) {
  if (k.includes("pass_yd")) return "Passing Yards";
  if (k.includes("pass_attempt")) return "Pass Attempts";
  if (k.includes("pass_complet")) return "Pass Completions";
  if (k.includes("pass_tds")) return "Passing TDs";

  if (k.includes("rush_yd")) return "Rushing Yards";
  if (k.includes("rush_tds")) return "Rushing TDs";

  if (k.includes("reception_yd")) return "Receiving Yards";
  if (k.includes("receptions")) return "Receptions";
  if (k.includes("reception_tds")) return "Receiving TDs";

  if (k.includes("anytime")) return "Anytime TD";
  return "Other Props";
}

/* AGGREGATION */

function aggregateProps(ev) {
  const cats = {};

  for (const book of ev.bookmakers || []) {
    const w = BOOK_WEIGHTS[book.key] || 1;

    for (const mkt of book.markets || []) {
      const cat = catKey(mkt.key);

      for (const o of mkt.outcomes || []) {
        const player = normalizePlayer(o.description);
        const isOver = o.name.toLowerCase().includes("over");
        const isUnder = o.name.toLowerCase().includes("under");
        const point = o.point ?? null;
        const price = o.price ?? null;
        const imp = implied(price);
        const label = titleCase(mkt.key.replace("player_", "").replace(/_/g, " "));

        if (!cats[cat]) cats[cat] = [];

        let entry = cats[cat].find(e => e.player === player && e.point === point);
        if (!entry) {
          entry = {
            player,
            label,
            point,
            over_list: [],
            under_list: [],
            over_odds: null,
            under_odds: null
          };
          cats[cat].push(entry);
        }

        if (isOver) {
          entry.over_list.push({ p: imp, w });
          if (!entry.over_odds || price > entry.over_odds) entry.over_odds = price;
        }
        if (isUnder) {
          entry.under_list.push({ p: imp, w });
          if (!entry.under_odds || price > entry.under_odds) entry.under_odds = price;
        }
      }
    }
  }

  /* Compute no-vig, weighted fair prob, EV, stability */
  for (const c in cats) {
    cats[c] = cats[c]
      .map(p => {
        const oAvg = p.over_list.length ? weightedFair(p.over_list) : 0.5;
        const uAvg = p.under_list.length ? weightedFair(p.under_list) : 0.5;

        const [fO, fU] = symmetricNoVig(oAvg, uAvg);

        const stO = variance(p.over_list.map(x => x.p));
        const stU = variance(p.under_list.map(x => x.p));

        p.over_prob = fO;
        p.under_prob = fU;

        p.over_ev = edge(fO, oAvg, stO);
        p.under_ev = edge(fU, uAvg, stU);

        p.lowConfidence = p.over_list.length + p.under_list.length <= 2;

        return p;
      })
      .filter(p => !p.lowConfidence)
      .sort((a, b) => {
        const ae = Math.max(a.over_ev ?? -99, a.under_ev ?? -99);
        const be = Math.max(b.over_ev ?? -99, b.under_ev ?? -99);
        return be - ae;
      });
  }

  return cats;
}

/* MAIN HANDLER */

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    const markets = [
      "player_pass_attempts",
      "player_pass_completions",
      "player_pass_tds",
      "player_pass_yds",
      "player_receptions",
      "player_reception_tds",
      "player_reception_yds",
      "player_rush_yds",
      "player_rush_tds",
      "player_tds_over",
      "player_anytime_td"
    ];

    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}` +
      `&regions=us&oddsFormat=american&markets=${markets.join(",")}`;

    const r = await fetch(url);
    if (!r.ok) return res.status(500).json({ error: "Props API failed" });

    const json = await r.json();
    const ev = Array.isArray(json) ? json[0] : json;

    return res.status(200).json({ categories: aggregateProps(ev) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
