// /api/props.js — Corrected props consensus engine
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   BOOK WEIGHTS
   ============================================================ */

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85
};

/* ============================================================
   HELPERS
   ============================================================ */

function implied(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function noVig(pA, pB) {
  const sum = pA + pB;
  return sum > 0 ? [pA / sum, pB / sum] : [0.5, 0.5];
}

function weightedAvg(list) {
  const wSum = list.reduce((s, x) => s + x.w, 0);
  if (!wSum) return null;
  return list.reduce((s, x) => s + x.p * x.w, 0) / wSum;
}

function stabilityScore(arr) {
  if (arr.length < 2) return 0.5;
  const mean = arr.reduce((a, b) => a + b, 0) / arr.length;
  const v = arr.reduce((s, x) => s + (x - mean) ** 2, 0) / arr.length;
  return Math.max(0.5, Math.min(1, 1 - v * 4));
}

function ev(fair, odds, stability) {
  return (fair - implied(odds)) * stability;
}

function normalizePlayer(n) {
  return n
    ?.replace(/\s+/g, " ")
    .replace(/ Jr\.?| III| II| IV| V/g, "")
    .trim() || "Unknown";
}

function titleCase(s) {
  return s.replace(/\w\S*/g, w => w[0].toUpperCase() + w.slice(1));
}

/* ============================================================
   CATEGORY MAP
   ============================================================ */

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

  /* Finalize */
  const out = {};

  for (const c in cats) {
    out[c] = Object.values(cats[c])
      .map(p => {
        if (!p.over.length || !p.under.length) return null;

        // no-vig per book already implicit, now aggregate
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
      .slice(0, 3); // show top 2–3 props per category
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
      "player_pass_attempts",
      "player_pass_completions",
      "player_pass_tds",
      "player_pass_yds",
      "player_receptions",
      "player_reception_tds",
      "player_reception_yds",
      "player_rush_yds",
      "player_rush_tds",
      "player_anytime_td"
    ];

    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}` +
      `&regions=us&oddsFormat=american&markets=${markets.join(",")}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Props API failed");

    const json = await r.json();
    const ev = Array.isArray(json) ? json[0] : json;

    res.status(200).json({ categories: aggregateProps(ev) });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
}
