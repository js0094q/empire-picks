// ===============================================
// Hybrid-Odds + Parlay + Consensus Dashboard
// Uses ESPN hidden API if available; else fallback to existing API
// ===============================================

import { NFL_TEAMS } from "./teams.js";

const $ = (sel, root = document) => (root || document).querySelector(sel);
const $$ = (sel, root = document) => Array.from((root || document).querySelectorAll(sel));
const money = o => (o > 0 ? `+${o}` : String(o));

function prob(odds) {
  odds = Number(odds);
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}
function americanToDecimal(odds) {
  odds = Number(odds);
  return odds > 0 ? 1 + odds/100 : 1 + 100/Math.abs(odds);
}
function avg(arr) {
  return arr.length ? arr.reduce((a,b) => a + b, 0) / arr.length : 0;
}
function noVig(p1, p2) {
  const t = p1 + p2;
  return t === 0 ? [0.5, 0.5] : [p1/t, p2/t];
}

// Parlay state
let PARLAY_POOL = [];

// Root elements
const gamesEl = $("#games");
const refreshBtn = $("#refreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", loadAll);

async function loadAll() {
  if (!gamesEl) return;
  gamesEl.textContent = "Loading NFL data…";
  PARLAY_POOL = [];

  try {
    // 1. Fetch events (your existing events source)
    const evRes = await fetch("/api/events");        // adapt as needed
    if (!evRes.ok) throw new Error("Failed to fetch events");
    const events = await evRes.json();

    // 2. For each event, fetch odds via hybrid function
    const games = await Promise.all(events.map(async ev => {
      try {
        const odds = await fetchHybridOdds(ev.id);
        return { ev, odds };
      } catch (err) {
        console.warn("Odds fetch failed for event", ev.id, err);
        return null;
      }
    }));

    gamesEl.innerHTML = "";
    games.forEach(g => {
      if (g && g.odds) {
        const card = renderGame(g.ev, g.odds);
        gamesEl.append(card);
      }
    });

    renderBestParlay();
  } catch (err) {
    console.error("loadAll error:", err);
    gamesEl.textContent = "Failed to load data.";
  }
}

// HYBRID ODDS FETCHER
async function fetchHybridOdds(eventId) {
  // Use proxy instead of direct ESPN URL
  const proxyUrl = `/espn-odds/${encodeURIComponent(eventId)}`;
  try {
    const r = await fetch(proxyUrl);
    if (r.ok) {
      const data = await r.json();
      const parsed = parseEspnOdds(data);
      if (parsed) return parsed;
    } else {
      throw new Error("Proxy returned status " + r.status);
    }
  } catch (err) {
    console.warn("ESPN-proxy fetch failed:", err);
  }

  // fallback to original odds API
  const backupRes = await fetch(`/api/odds?eventId=${encodeURIComponent(eventId)}`);
  if (!backupRes.ok) throw new Error("Backup odds fetch failed");
  return backupRes.json();
}

  // 2) Fallback to your existing odds-API
  const backupRes = await fetch(`/api/odds?eventId=${encodeURIComponent(eventId)}`);
  if (!backupRes.ok) throw new Error("Backup odds fetch failed");
  const backupJson = await backupRes.json();
  return parseBackupOdds(backupJson);
}

// Parse ESPN odds JSON into unified format
function parseEspnOdds(data) {
  if (!data.items || !data.items.length) return null;

  // For simplicity pick the first provider (you may want to pick consensus or specific book)
  const providerEntry = data.items[0];
  const oddsObj = providerEntry;

  // Depending on structure; based on docs: details, spread, overUnder, homeTeamOdds, awayTeamOdds
  const mlAway = oddsObj.awayTeamOdds?.moneyline;
  const mlHome = oddsObj.homeTeamOdds?.moneyline;
  const spread = oddsObj.spread;             // e.g. -3.5 (home -3.5)
  const spreadOdds = oddsObj.spreadOdds;      // implied moneyline for spread?
  const total = oddsObj.overUnder;            // e.g. 48.5
  const overOdds = oddsObj.overOdds;
  const underOdds = oddsObj.underOdds;

  return {
    bookmakers: [
      {
        title: providerEntry.provider?.name || "ESPN",
        markets: [
          mlAway != null && mlHome != null
            ? { key: "h2h", outcomes: [
                { name: oddsObj.awayTeam, price: mlAway },
                { name: oddsObj.homeTeam, price: mlHome }
              ]}
            : null,
          spread != null
            ? { key: "spreads", outcomes: [
                { name: oddsObj.homeTeam, point: spread, price: spreadOdds }
              ]}
            : null,
          total != null
            ? { key: "totals", outcomes: [
                { name: "Over",  point: total, price: overOdds },
                { name: "Under", point: total, price: underOdds }
              ]}
            : null
        ].filter(Boolean)
      }
    ]
  };
}

// Parse backup odds JSON (your existing API) — adapt as needed
function parseBackupOdds(json) {
  // assume structure similar to your prior usage: bookmakers array
  return json;
}

// Render UI for one game
function renderGame(ev, odds) {
  const card = document.createElement("div");
  card.className = "card";
  const kickoff = new Date(ev.commence_time).toLocaleString();

  const header = document.createElement("div");
  header.className = "card-header";

  const awayDiv = document.createElement("div");
  awayDiv.style.display = "flex";
  awayDiv.style.alignItems = "center";
  const awayLogo = document.createElement("img");
  awayLogo.src = NFL_TEAMS[ev.away_team]?.logo || "";
  awayLogo.style.height = "32px";
  awayLogo.style.opacity = "0.9";
  const awayName = document.createElement("span");
  awayName.textContent = ev.away_team;
  awayName.style.marginLeft = "6px";
  awayDiv.append(awayLogo, awayName);

  const centerDiv = document.createElement("div");
  centerDiv.style.textAlign = "center";
  centerDiv.style.fontSize = "0.9rem";
  centerDiv.style.color = "#ccc";
  centerDiv.textContent = kickoff;

  const homeDiv = document.createElement("div");
  homeDiv.style.display = "flex";
  homeDiv.style.alignItems = "center";
  const homeName = document.createElement("span");
  homeName.textContent = ev.home_team;
  homeName.style.marginRight = "6px";
  const homeLogo = document.createElement("img");
  homeLogo.src = NFL_TEAMS[ev.home_team]?.logo || "";
  homeLogo.style.height = "32px";
  homeLogo.style.opacity = "0.9";
  homeDiv.append(homeName, homeLogo);

  header.append(awayDiv, centerDiv, homeDiv);
  card.append(header);

  const body = document.createElement("div");
  body.className = "card-body";

  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  body.append(createAnalyticsBlock(analytics));

  const linesBlock = document.createElement("div");
  body.append(linesBlock);
  renderLines(linesBlock, odds, analytics);

  const propsBlock = document.createElement("div");
  propsBlock.style.marginTop = "16px";
  const loadPropsBtn = document.createElement("button");
  loadPropsBtn.textContent = "Load Player Props";
  loadPropsBtn.dataset.parlay = "0";
  loadPropsBtn.addEventListener("click", () => loadProps(ev.id, propsBlock));
  propsBlock.append(loadPropsBtn);
  body.append(propsBlock);

  card.append(body);

  const homeTeamObj = NFL_TEAMS[ev.home_team];
  if (homeTeamObj) {
    card.style.setProperty("--team-primary", homeTeamObj.primary);
    card.style.setProperty("--team-secondary", homeTeamObj.secondary);
  }

  return card;
}

function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers || [];
  const mlAway = [], mlHome = [];
  const spreadArr = [], totalArr = [];

  books.forEach(bm => {
    (bm.markets || []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === away);
        const h = m.outcomes.find(o => o.name === home);
        if (a && h) {
          mlAway.push(prob(a.price));
          mlHome.push(prob(h.price));
        }
      }
      if (m.key === "spreads") {
        m.outcomes.forEach(o => {
          if (typeof o.point === "number") spreadArr.push(o.point);
        });
      }
      if (m.key === "totals") {
        m.outcomes.forEach(o => {
          if (typeof o.point === "number") totalArr.push(o.point);
        });
      }
    });
  });

  const pa = avg(mlAway), ph = avg(mlHome);
  const [nvA, nvH] = noVig(pa, ph);
  const winner = nvA > nvH ? away : home;
  const winnerProb = Math.max(nvA, nvH);

  const consensusSpread = spreadArr.length ? avg(spreadArr) : null;
  const consensusTotal  = totalArr.length  ? avg(totalArr)  : null;

  let projHome = null, projAway = null;
  if (consensusSpread != null && consensusTotal != null) {
    const s = consensusSpread, T = consensusTotal;
    projHome = (T - s)/2;
    projAway = (T + s)/2;
  }

  return { away, home, nvAway, nvHome, winner, winnerProb,
           consensusSpread, consensusTotal, projHome, projAway };
}

function createAnalyticsBlock(a) {
  const box = document.createElement("div");
  box.className = "analytics-block";
  let html = `<div><strong>Win Prob:</strong> ${a.winner} — ${(a.winnerProb*100).toFixed(1)}%</div>`;

  if (a.projHome != null && a.projAway != null) {
    html += `<div style="font-size:0.9rem; color:#ccc;">
      Projected Score ▶ ${a.away} ${a.projAway.toFixed(1)}, ${a.home} ${a.projHome.toFixed(1)}
    </div>`;
  }

  if (a.consensusSpread != null) {
    html += `<div style="margin-top:6px; font-size:0.9rem;">
      Consensus Spread: ${a.home} ≈ ${a.consensusSpread.toFixed(1)} pts
    </div>`;
  }

  if (a.consensusTotal != null) {
    html += `<div style="margin-top:4px; font-size:0.9rem; color:#ccc;">
      Consensus Total (O/U): ≈ ${a.consensusTotal.toFixed(1)} pts
    </div>`;
  }

  box.innerHTML = html;
  return box;
}

// renderLines, loadProps, parlay logic … (unchanged from your working version — ensure add-leg buttons have dataset.parlay="1")

function renderBestParlay() {
  const slot = $("#bestParlay");
  if (!slot) return;

  if (!PARLAY_POOL.length) {
    slot.innerHTML = `<h2>🔥 Best Parlay</h2><p style="color:#ccc;">No legs yet.</p>`;
    return;
  }

  const picks = PARLAY_POOL.slice(0,5);
  let dec = 1;
  picks.forEach(l => dec *= americanToDecimal(l.price));

  const marketOdds = dec >= 2
    ? "+" + Math.round((dec - 1)*100)
    : "-" + Math.round(100 / (dec - 1));

  let html = `<h2>🔥 Best Parlay</h2><ul>`;
  picks.forEach(p => {
    const label = p.team || p.player || "Leg";
    html += `<li>${label} — ${p.game} @ ${money(p.price)}</li>`;
  });
  html += `</ul><div style="color:#ccc;font-size:0.9rem;">Parlay Odds: <strong>${marketOdds}</strong></div>`;
  slot.innerHTML = html;
}

document.addEventListener("click", e => {
  const btn = e.target.closest("[data-parlay='1']");
  if (!btn) return;
  const leg = {
    market: btn.dataset.market,
    price:  Number(btn.dataset.price),
    game:   btn.dataset.game,
    team:   btn.dataset.team || null,
    player: btn.dataset.player || null,
    side:   btn.dataset.side || null,
    type:   btn.dataset.type || null,
    point:  btn.dataset.point || "",
    trueProb: Number(btn.dataset.trueprob || 0),
    edge:     Number(btn.dataset.edge     || 0)
  };
  PARLAY_POOL.push(leg);
  renderBestParlay();
});
