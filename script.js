// ==============================
// script.js — Hybrid (ESPN + fallback) with ID-map (Option B)
// ==============================

import { NFL_TEAMS } from "./teams.js";

const $   = (sel, root = document) => (root || document).querySelector(sel);
const $$  = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
const money = o => (o > 0 ? "+"+o : String(o));

function prob(odds) {
  odds = Number(odds);
  return odds > 0 ? 100/(odds+100) : -odds/(-odds + 100);
}
function americanToDecimal(odds) {
  odds = Number(odds);
  return odds > 0 ? 1 + odds/100 : 1 + 100/Math.abs(odds);
}
function avg(arr) {
  return arr.length ? arr.reduce((a,b) => a + b, 0)/arr.length : 0;
}
function noVig(p1, p2) {
  const t = p1 + p2;
  return t === 0 ? [0.5,0.5] : [p1/t, p2/t];
}

let PARLAY_POOL = [];

// Load id-map JSON (oddsApiId → espnId)
let ID_MAP = {};
async function loadIdMap() {
  try {
    const r = await fetch("./id_map.json");
    if (!r.ok) throw new Error("id_map.json load failed");
    ID_MAP = await r.json();
    console.log("ID map loaded", ID_MAP);
  } catch (err) {
    console.warn("Could not load id_map.json — ESPN mapping disabled", err);
    ID_MAP = {};
  }
}

const gamesEl = $("#games");
const refreshBtn = $("#refreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", loadAll);

async function loadAll() {
  if (!gamesEl) return;
  gamesEl.textContent = "Loading NFL data…";
  PARLAY_POOL = [];

  await loadIdMap();

  try {
    const evRes = await fetch("/api/events");
    if (!evRes.ok) throw new Error("Events fetch failed");
    const events = await evRes.json();

    const oddsRes = await fetch("/api/odds");
    if (!oddsRes.ok) throw new Error("Odds fetch failed");
    const oddsWrap = await oddsRes.json();
    const oddsList = Array.isArray(oddsWrap) ? oddsWrap : (oddsWrap.data ?? []);

    const byId = Object.fromEntries(oddsList.map(g => [g.id, g]));

    const now = Date.now();
    const cutoff = 4 * 60 * 60 * 1000;

    const valid = events.filter(ev => {
      const g = byId[ev.id];
      if (!g) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoff;
    });

    gamesEl.innerHTML = "";
    for (const ev of valid) {
      const oddsBackup = byId[ev.id];
      const espnId = ID_MAP[ev.id];
      let odds = null;

      if (espnId) {
        try {
          odds = await fetchEspnOdds(espnId);
        } catch (err) {
          console.warn("ESPN odds failed — using backup", ev.id, err);
        }
      }

      if (!odds) odds = oddsBackup;

      gamesEl.append(renderGame(ev, odds));
    }

    renderBestParlay();
  } catch (err) {
    console.error("loadAll error:", err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

async function fetchEspnOdds(espnId) {
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${espnId}/competitions/${espnId}/odds`;
  const r = await fetch(url);
  if (!r.ok) throw new Error("ESPN odds HTTP "+r.status);
  const data = await r.json();
  return parseEspnOdds(data);
}

function parseEspnOdds(data) {
  if (!data.items || !data.items.length) return null;
  const entry = data.items[0];
  const mlAway = entry.awayTeamOdds?.moneyline;
  const mlHome = entry.homeTeamOdds?.moneyline;
  const spread = entry.spread;
  const spreadOdds = entry.spreadOdds;
  const total = entry.overUnder;
  const overOdds = entry.overOdds;
  const underOdds = entry.underOdds;

  const markets = [];

  if (mlAway != null && mlHome != null) {
    markets.push({key:"h2h", outcomes:[
      { name: entry.awayTeam, price: mlAway },
      { name: entry.homeTeam, price: mlHome }
    ]});
  }
  if (spread != null) {
    markets.push({key:"spreads", outcomes:[
      { name: entry.homeTeam, point: spread, price: spreadOdds }
    ]});
  }
  if (total != null) {
    markets.push({key:"totals", outcomes:[
      { name:"Over", point: total, price: overOdds },
      { name:"Under", point: total, price: underOdds }
    ]});
  }

  return { bookmakers:[{ title:"ESPN", markets }] };
}

// ... (rest of rendering logic: renderGame, computeGameAnalytics, renderLines, loadProps, parlay logic etc. — same as before) ...

loadAll();
