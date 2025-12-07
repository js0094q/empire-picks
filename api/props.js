// /api/props.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   HELPERS
   ============================================================ */

function implied(odds) {
  if (odds == null) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function avg(arr) {
  if (!arr || arr.length === 0) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function noVigNormalize(list) {
  const t = list.reduce((a, b) => a + b, 0);
  if (!t) return list.map(() => 0.5);
  return list.map(v => v / t);
}

function edge(fair, imp) {
  if (fair == null || imp == null) return null;
  return fair - imp;
}

// Title Case helper
function titleCase(str) {
  return str.replace(/\w\S*/g, w => w[0].toUpperCase() + w.substring(1));
}

// Player name cleaner
function normalizePlayer(name) {
  if (!name) return "Unknown Player";
  let n = name.trim();
  n = n.replace(/\s+/g, " ");
  n = n.replace(/ Jr\.?| III| II| IV| V/g, "");
  if (/^[A-Z]{2,4}\s+/.test(n)) n = n.replace(/^[A-Z]{2,4}\s+/, "");
  return n.trim();
}

/* ============================================================
   CATEGORY MAPPING
   ============================================================ */

function categoryOf(key) {
  if (key.includes("pass_yd")) return "Passing Yards";
  if (key.includes("pass_attempts")) return "Pass Attempts";
  if (key.includes("pass_completions")) return "Pass Completions";
  if (key.includes("pass_tds")) return "Passing Touchdowns";

  if (key.includes("rush_yd")) return "Rushing Yards";
  if (key.includes("rush_tds")) return "Rushing Touchdowns";

  if (key.includes("reception_yd")) return "Receiving Yards";
  if (key.includes("receptions")) return "Receptions";
  if (key.includes("reception_tds")) return "Receiving Touchdowns";

  if (key.includes("anytime")) return "Anytime TD";
  if (key.includes("tds_over")) return "Total TDs";

  return "Other Props";
}

/* ============================================================
   AGGREGATION
   ============================================================ */

function aggregateProps(ev) {
  const categories = {};

  for (const book of ev.bookmakers || []) {
    for (const market of book.markets || []) {
      const cat = categoryOf(market.key);

      for (const out of market.outcomes || []) {
        const player = normalizePlayer(out.description || out.player || "");
        const isOver = out.name.toLowerCase().includes("over");
        const isUnder = out.name.toLowerCase().includes("under");
        const line = out.point ?? null;
        const price = out.price ?? null;

        if (!categories[cat]) categories[cat] = [];

        // find entry
        let entry = categories[cat].find(
          e => e.player === player && e.point === line
        );

        if (!entry) {
          entry = {
            player,
            label: titleCase(market.key.replace("player_", "").replace(/_/g, " ")),
            point: line,
            over_odds: null,
            under_odds: null,
            over_list: [],
            under_list: []
          };
          categories[cat].push(entry);
        }

        const imp = implied(price);

        if (isOver) {
          if (!entry.over_odds || price > entry.over_odds) entry.over_odds = price;
          entry.over_list.push(imp);
        }

        if (isUnder) {
          if (!entry.under_odds || price > entry.under_odds) entry.under_odds = price;
          entry.under_list.push(imp);
        }
      }
    }
  }

  /* Final EV & filtering */
  for (const cat in categories) {
    categories[cat] = categories[cat]
      .map(p => {
        const overAvg = avg(p.over_list);
        const underAvg = avg(p.under_list);

        const [fO, fU] = noVigNormalize([
          overAvg ?? 0.5,
          underAvg ?? 0.5
        ]);

        p.over_prob = fO;
        p.under_prob = fU;

        p.over_ev = edge(fO, overAvg);
        p.under_ev = edge(fU, underAvg);

        // Low confidence: only 1 book on both sides
        p.lowConfidence =
          (p.over_list.length <= 1 && p.under_list.length <= 1);

        return p;
      })
      .filter(p => !p.lowConfidence) // remove garbage props
      .sort((a, b) => {
        const aEV = Math.max(a.over_ev ?? -999, a.under_ev ?? -999);
        const bEV = Math.max(b.over_ev ?? -999, b.under_ev ?? -999);
        return bEV - aEV;
      });
  }

  return categories;
}

/* ============================================================
   MAIN HANDLER
   ============================================================ */

export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing event ID" });

    const markets = [
      "player_pass_attempts",
      "player_pass_completions",
      "player_pass_tds",
      "player_pass_yds",
      "player_receptions",
      "player_reception_tds",
      "player_reception_yds",
      "player_rush_tds",
      "player_rush_yds",
      "player_tds_over",
      "player_anytime_td"
    ];

    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}` +
      `&regions=us&oddsFormat=american&markets=${markets.join(",")}`;

    const r = await fetch(url);
    if (!r.ok) return res.status(500).json({ error: "Props API failure" });

    const json = await r.json();
    const ev = Array.isArray(json) ? json[0] : json;
    if (!ev) return res.status(200).json({ categories: {} });

    return res.status(200).json({
      categories: aggregateProps(ev)
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: err.message });
  }
}
