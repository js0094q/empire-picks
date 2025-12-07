// /api/props.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

/* ============================================================
   MATH HELPERS
   ============================================================ */

function implied(odds) {
  if (odds == null) return null;
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function avg(arr) {
  if (!arr || !arr.length) return null;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function noVigNormalize(list) {
  if (!list || !list.length) return [0.5, 0.5];

  const total = list.reduce((a, c) => a + c, 0);
  if (!total) return list.map(() => 0.5);

  return list.map(p => p / total);
}

function edge(fairProb, impliedProb) {
  if (fairProb == null || impliedProb == null) return null;
  return fairProb - impliedProb;
}

/* ============================================================
   PLAYER NAME NORMALIZATION
   ============================================================ */

function normalizePlayer(rawName) {
  if (!rawName) return "Unknown Player";

  let name = rawName.trim();

  // Remove double spaces
  name = name.replace(/\s+/g, " ");

  // Remove suffixes (API sometimes includes weird characters)
  name = name.replace(/ Jr\.?| III| II| IV| V/g, "");

  // Remove team prefixes that some bookmakers attach:
  // Example: "KC Patrick Mahomes" → "Patrick Mahomes"
  if (name.match(/^[A-Z]{2,4}\s+/)) {
    name = name.replace(/^[A-Z]{2,4}\s+/, "");
  }

  // Remove stray commas or hyphens
  name = name.replace(/^[,-]+/, "").replace(/[,-]+$/, "");

  return name.trim();
}

/* ============================================================
   CATEGORY MAPPING
   ============================================================ */

// Converts Odds API market keys → clean UI category names
function categoryOf(key) {
  if (key.includes("pass_yd")) return "Passing Yards";
  if (key.includes("pass_attempts")) return "Pass Attempts";
  if (key.includes("pass_completions")) return "Pass Completions";
  if (key.includes("pass_tds")) return "Pass Touchdowns";

  if (key.includes("rush_yd")) return "Rushing Yards";
  if (key.includes("rush_tds")) return "Rushing Touchdowns";

  if (key.includes("reception_yd")) return "Receiving Yards";
  if (key.includes("receptions")) return "Receptions";
  if (key.includes("reception_tds")) return "Receiving Touchdowns";

  if (key.includes("anytime")) return "Anytime TD Scorer";
  if (key.includes("tds_over")) return "Total TDs (Over Only)";

  return "Other Props";
}

/* ============================================================
   AGGREGATE PROPS ENGINE
   ============================================================ */

function aggregateProps(eventData) {
  const categories = {};

  for (const book of eventData.bookmakers || []) {
    for (const market of book.markets || []) {
      const cat = categoryOf(market.key);

      for (const out of market.outcomes || []) {
        const rawPlayer = out.description || out.player || null;
        const player = normalizePlayer(rawPlayer);

        const isOver = out.name.toLowerCase().includes("over");
        const isUnder = out.name.toLowerCase().includes("under");

        const line = out.point ?? null;
        const price = out.price ?? null;

        // Initialize category container
        if (!categories[cat]) categories[cat] = [];

        // Look for an existing entry for the same player & line
        let entry = categories[cat].find(
          e => e.player === player && e.point === line
        );

        if (!entry) {
          entry = {
            player,
            label: market.key.replace("player_", "").replace(/_/g, " "),
            point: line,
            over_odds: null,
            under_odds: null,
            over_list: [],
            under_list: []
          };
          categories[cat].push(entry);
        }

        const pImp = implied(price);

        if (isOver) {
          if (!entry.over_odds || price > entry.over_odds) {
            entry.over_odds = price;
          }
          entry.over_list.push(pImp);
        }

        if (isUnder) {
          if (!entry.under_odds || price > entry.under_odds) {
            entry.under_odds = price;
          }
          entry.under_list.push(pImp);
        }
      }
    }
  }

  /* ============================================================
     FINALIZE EV + CONSENSUS PROBABILITIES
     ============================================================ */

  for (const cat in categories) {
    categories[cat].forEach(p => {
      const overAvg = avg(p.over_list) ?? 0.5;
      const underAvg = avg(p.under_list) ?? 0.5;

      const [fO, fU] = noVigNormalize([overAvg, underAvg]);

      p.over_prob = fO;
      p.under_prob = fU;

      p.over_ev = edge(fO, overAvg);
      p.under_ev = edge(fU, underAvg);
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
    if (!id) {
      return res.status(400).json({ error: "Missing event ID" });
    }

    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}` +
      `&regions=us&oddsFormat=american` +
      `&markets=` +
      [
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
      ].join(",");

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(500).json({ error: "Props API error" });
    }

    const json = await r.json();

    // API sometimes returns object instead of array
    const eventData = Array.isArray(json) ? json[0] : json;
    if (!eventData) {
      return res.status(200).json({ categories: {} });
    }

    const categories = aggregateProps(eventData);

    return res.status(200).json({ categories });
  } catch (err) {
    console.error("Props API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
