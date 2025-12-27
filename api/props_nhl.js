// /api/props_nhl.js — NHL props consensus engine
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

function implied(o) {
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

function noVig(pA, pB) {
  const sum = pA + pB;
  return sum > 0 ? [pA / sum, pB / sum] : [0.5, 0.5];
}

function weightedAvg(arr) {
  const w = arr.reduce((s, x) => s + x.w, 0);
  if (!w) return null;
  return arr.reduce((s, x) => s + x.p * x.w, 0) / w;
}

function stabilityScore(arr) {
  if (arr.length < 2) return 0.7;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.max(0.55, Math.min(0.95, 1 - v * 3));
}

function ev(fair, odds, stability) {
  return (fair - implied(odds)) * stability;
}

function normalizePlayer(name) {
  return name
    ?.replace(/\s+/g, " ")
    .replace(/ Jr\.?| Sr\.?| III| II| IV/g, "")
    .trim() || "Unknown";
}

function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

/* ============================================================
   MARKET → CATEGORY MAP
   ============================================================ */

function catKey(k) {
  if (k.includes("shots")) return "Shots on Goal";
  if (k.includes("points")) return "Player Points";
  if (k.includes("goals")) return "Goals";
  if (k.includes("assists")) return "Assists";
  if (k.includes("saves")) return "Goalie Saves";
  if (k.includes("power_play")) return "Power Play Points";
  return "Other Props";
}

/* ============================================================
   AGGREGATION
   ============================================================ */

function aggregateProps(event) {
  const cats = {};

  for (const book of event.bookmakers || []) {
    const w = BOOK_WEIGHTS[book.key] || 1;

    for (const mkt of book.markets || []) {
      const cat = catKey(mkt.key);
      if (!cats[cat]) cats[cat] = {};

      for (const o of mkt.outcomes || []) {
        const player = normalizePlayer(o.description);
        const point = o.point ?? null;
        const side = o.name.toLowerCase().includes("over") ? "over" : "under";
        const price = o.price;
        const imp = implied(price);

        const key = `${player}|${point}`;
        if (!cats[cat][key]) {
          cats[cat][key] = {
            player,
            label: titleCase(mkt.key.replace("player_", "").replace(/_/g, " ")),
            point,
            over: [],
            under: [],
            best_odds: { over: null, under: null }
          };
        }

        cats[cat][key][side].push({ p: imp, w });
        if (
          !cats[cat][key].best_odds[side] ||
          price > cats[cat][key].best_odds[side]
        ) {
          cats[cat][key].best_odds[side] = price;
        }
      }
    }
  }

  const out = {};

  for (const c in cats) {
    out[c] = Object.values(cats[c])
      .map(p => {
        if (!p.over.length || !p.under.length) return null;

        const fairOver = weightedAvg(p.over);
        const fairUnder = weightedAvg(p.under);
        const [fO, fU] = noVig(fairOver, fairUnder);

        const stO = stabilityScore(p.over.map(x => x.p));
        const stU = stabilityScore(p.under.map(x => x.p));

        return {
          player: p.player,
          label: p.label,
          point: p.point,
          over_odds: p.best_odds.over,
          under_odds: p.best_odds.under,
          over_prob: fO,
          under_prob: fU,
          over_ev: ev(fO, p.best_odds.over, stO),
          under_ev: ev(fU, p.best_odds.under, stU)
        };
      })
      .filter(Boolean)
      .sort((a, b) => {
        const ae = Math.max(a.over_ev, a.under_ev);
        const be = Math.max(b.over_ev, b.under_ev);
        return be - ae;
      })
      .slice(0, 3);
  }

  return out;
}

/* ============================================================
   HANDLER
   ============================================================ */

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing ID" });

    const markets = [
      "player_shots_on_goal",
      "player_points",
      "player_goals",
      "player_assists",
      "player_goalie_saves"
    ];

    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}` +
      `&regions=us&oddsFormat=american&markets=${markets.join(",")}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("NHL props API failed");

    const json = await r.json();
    const ev = Array.isArray(json) ? json[0] : json;

    res.status(200).json({ categories: aggregateProps(ev) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
