// /api/props_nhl.js
import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "icehockey_nhl";
const BASE = "https://api.the-odds-api.com/v4";

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.3,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95
};

const implied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const noVig = (a, b) => {
  const s = a + b;
  return s ? [a / s, b / s] : [0.5, 0.5];
};

const weighted = arr =>
  arr.reduce((s, x) => s + x.p * x.w, 0) /
  arr.reduce((s, x) => s + x.w, 0);

const ev = (fair, odds, stab) => (fair - implied(odds)) * stab;

function catKey(k) {
  if (k.includes("shots")) return "Shots on Goal";
  if (k.includes("points")) return "Points";
  if (k.includes("goals")) return "Goals";
  if (k.includes("assists")) return "Assists";
  if (k.includes("saves")) return "Goalie Saves";
  return "Other Props";
}

export default async function handler(req, res) {
  const id = req.query.id;
  if (!id) return res.status(400).json({ error: "Missing ID" });

  const markets = [
    "player_shots_on_goal",
    "player_points",
    "player_goals",
    "player_assists",
    "player_goalie_saves"
  ];

  const r = await fetch(
    `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}&regions=us&markets=${markets.join(",")}`
  );

  const json = await r.json();
  const evData = Array.isArray(json) ? json[0] : json;

  const cats = {};

  for (const b of evData.bookmakers || []) {
    const w = BOOK_WEIGHTS[b.key] || 1;

    for (const m of b.markets || []) {
      const cat = catKey(m.key);
      if (!cats[cat]) cats[cat] = {};

      for (const o of m.outcomes || []) {
        const key = `${o.description}|${o.point}`;
        if (!cats[cat][key]) {
          cats[cat][key] = {
            player: o.description,
            label: m.key.replace("player_", "").replace(/_/g, " "),
            point: o.point,
            over: [],
            under: [],
            best: { over: null, under: null }
          };
        }

        const side = o.name.toLowerCase().includes("over") ? "over" : "under";
        cats[cat][key][side].push({ p: implied(o.price), w });
        if (!cats[cat][key].best[side] || o.price > cats[cat][key].best[side]) {
          cats[cat][key].best[side] = o.price;
        }
      }
    }
  }

  const out = {};

  for (const c in cats) {
    out[c] = Object.values(cats[c]).map(p => {
      if (!p.over.length || !p.under.length) return null;
      const [fO, fU] = noVig(weighted(p.over), weighted(p.under));
      return {
        player: p.player,
        label: p.label,
        point: p.point,
        over_odds: p.best.over,
        under_odds: p.best.under,
        over_prob: fO,
        under_prob: fU,
        over_ev: ev(fO, p.best.over, 0.75),
        under_ev: ev(fU, p.best.under, 0.75)
      };
    }).filter(Boolean);
  }

  res.status(200).json({ categories: out });
}
