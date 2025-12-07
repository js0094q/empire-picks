// /api/props.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

// --------------------------------------------
// Helpers
// --------------------------------------------
function implied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

function noVig(pList) {
  const s = pList.reduce((a, c) => a + c, 0);
  return pList.map(p => p / s);
}

function edge(fair, implied) {
  return fair - implied;
}

function pct(x) {
  return +(x * 100).toFixed(1);
}

// Categorize props by market key
function categoryOf(key) {
  if (key.includes("pass")) return "Passing";
  if (key.includes("rush")) return "Rushing";
  if (key.includes("reception") || key.includes("receiv")) return "Receiving";
  if (key.includes("td")) return "Touchdowns";
  return "Specials";
}

// --------------------------------------------
// Aggregate prop markets
// --------------------------------------------
function aggregateProps(eventData) {
  const cats = {};

  for (const b of eventData.bookmakers || []) {
    for (const m of b.markets || []) {
      const cat = categoryOf(m.key);

      for (const o of m.outcomes || []) {
        if (!o.description) continue; // skip malformed entries

        const player = o.description;
        const line = o.point;
        const odds = o.price;

        // Over or under?
        const isOver = o.name.toLowerCase().includes("over");
        const isUnder = o.name.toLowerCase().includes("under");

        const pImp = implied(odds);

        // Organize by category → player → line
        if (!cats[cat]) cats[cat] = [];

        // Find existing entry:
        let entry = cats[cat].find(e => e.player === player && e.point === line);
        if (!entry) {
          entry = {
            player,
            point: line,
            over_odds: null,
            under_odds: null,
            over_probs: [],
            under_probs: []
          };
          cats[cat].push(entry);
        }

        if (isOver) {
          entry.over_odds = entry.over_odds === null ? odds : Math.max(entry.over_odds, odds);
          entry.over_probs.push(pImp);
        }
        if (isUnder) {
          entry.under_odds = entry.under_odds === null ? odds : Math.max(entry.under_odds, odds);
          entry.under_probs.push(pImp);
        }
      }
    }
  }

  // Final compute of consensus, fair probs, EV
  Object.keys(cats).forEach(cat => {
    cats[cat].forEach(p => {
      const overImp = p.over_probs.length ? p.over_probs : [0.5];
      const underImp = p.under_probs.length ? p.under_probs : [0.5];

      const [fO, fU] = noVig([
        overImp.reduce((a, c) => a + c, 0) / overImp.length,
        underImp.reduce((a, c) => a + c, 0) / underImp.length
      ]);

      const oImpAvg = overImp.reduce((a, c) => a + c, 0) / overImp.length;
      const uImpAvg = underImp.reduce((a, c) => a + c, 0) / underImp.length;

      p.over_prob = fO;
      p.under_prob = fU;

      p.over_ev = fO - oImpAvg;
      p.under_ev = fU - uImpAvg;
    });
  });

  return cats;
}

// --------------------------------------------
// Handler
// --------------------------------------------
export default async function handler(req, res) {
  try {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: "Missing event id" });

    const url =
      `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}&regions=us&oddsFormat=american` +
      `&markets=player_pass_attempts,player_pass_completions,player_pass_tds,player_pass_yds,player_receptions,player_reception_tds,player_reception_yds,player_rush_tds,player_rush_yds,player_tds_over,player_anytime_td`;

    const r = await fetch(url);
    if (!r.ok) return res.status(500).json({ error: "Props API error" });

    const json = await r.json();

    // Use the first element (this endpoint returns an array)
    const eventData = Array.isArray(json) ? json[0] : json;
    if (!eventData) return res.status(200).json({ categories: {} });

    const categories = aggregateProps(eventData);

    res.status(200).json({ categories });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
