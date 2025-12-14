import { Teams } from "./teams.js";

/* ================= HELPERS ================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);
const impliedProb = o => o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const evClass = ev =>
  ev > 0.03 ? "ev-green" : ev < -0.03 ? "ev-red" : "ev-neutral";

const signalClass = d =>
  d > 0.15 ? "signal-strong" :
  d > 0.08 ? "signal-medium" :
  d > 0.04 ? "signal-light" : "";

const consensusLabel = p =>
  p > 0.75 ? "Very Strong" :
  p > 0.65 ? "Strong" :
  p > 0.55 ? "Moderate" : "Weak";

const kickoffLocal = utc =>
  new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

/* ================= STATE ================= */

const gamesContainer = document.getElementById("games-container");
const autoPickCandidates = [];

/* ================= FETCH ================= */

const fetchGames = async () => (await fetch("/api/events")).json();

/* ================= INIT ================= */

document.getElementById("refresh-btn").onclick = loadGames;
loadGames();

/* ================= LOAD ================= */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  autoPickCandidates.length = 0;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(gameCard(g)));
  renderTopPicks();
}

/* ================= GAME CARD ================= */

function gameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}">
        <span>@</span>
        <img src="${home.logo}">
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  const row = document.createElement("div");
  row.className = "markets-row";

  ["h2h", "spreads", "totals"].forEach(k =>
    row.appendChild(marketBox(game, k))
  );

  card.appendChild(row);
  return card;
}

/* ================= MARKETS ================= */

function marketBox(game, key) {
  const box = document.createElement("div");
  box.className = "market-box";

  const best = {};
  game.books[key].forEach(r =>
    [r.outcome1, r.outcome2].forEach(o => {
      if (!best[o.name] || o.odds > best[o.name].odds) best[o.name] = o;
    })
  );

  Object.values(best).forEach(o => {
    const imp = impliedProb(o.odds);
    const d = o.fair - imp;

    if (o.edge > 0.03 && o.fair > 0.55) {
      autoPickCandidates.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: o.fair,
        ev: o.edge,
        score: o.fair * o.edge
      });
    }

    box.innerHTML += `
      <div class="market-row ${signalClass(d)}">
        <div>
          <strong>${o.name}</strong> ${fmtOdds(o.odds)}
          <div class="muted">
            Book ${pct(imp)} • Model ${pct(o.fair)}
          </div>
        </div>
        <div class="badge">${consensusLabel(o.fair)}</div>
      </div>
    `;
  });

  return box;
}

/* ================= TOP PICKS ================= */

function renderTopPicks() {
  const box = document.getElementById("top-picks");

  const picks = [...autoPickCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  box.innerHTML = `
    <h3>Top Picks (Model-Weighted)</h3>
    ${picks.map(p => `
      <div class="top-pick">
        <strong>${p.label}</strong>
        <div class="muted">Prob ${pct(p.prob)} • EV ${pct(p.ev)}</div>
      </div>
    `).join("")}
  `;
}
/* =========================
   GLOBAL RESET & THEME
   ========================= */

html, body {
  margin: 0;
  padding: 0;
  background: radial-gradient(1200px 600px at 50% -20%, #0b1220, #020617);
  color: #e5e7eb;
  font-family: "Inter", -apple-system, BlinkMacSystemFont, system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

/* =========================
   HEADER
   ========================= */

.ep-header {
  position: sticky;
  top: 0;
  z-index: 10;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 20px;
  background: linear-gradient(180deg, #020617, #020617cc);
  border-bottom: 1px solid rgba(255,255,255,.06);
  backdrop-filter: blur(10px);
}

.ep-header .logo {
  font-weight: 800;
  letter-spacing: .3px;
  font-size: 1.1rem;
}

#refresh-btn {
  background: linear-gradient(135deg, #2563eb, #1d4ed8);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 8px 14px;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 6px 20px rgba(37,99,235,.35);
}

#refresh-btn:hover {
  filter: brightness(1.1);
}

/* =========================
   LAYOUT
   ========================= */

.layout {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 20px;
  padding: 20px;
}

@media (max-width: 900px) {
  .layout {
    grid-template-columns: 1fr;
  }
}

/* =========================
   LEFT RAIL (TOP PICKS)
   ========================= */

.left-rail {
  background: linear-gradient(180deg, #020617, #020617cc);
  border: 1px solid rgba(255,255,255,.06);
  border-radius: 16px;
  padding: 14px;
}

.top-pick {
  margin-top: 12px;
  padding: 12px;
  border-radius: 12px;
  background: linear-gradient(135deg, rgba(16,185,129,.18), rgba(16,185,129,.05));
  border: 1px solid rgba(16,185,129,.35);
}

.top-pick strong {
  display: block;
  margin-bottom: 4px;
}

/* =========================
   HERO
   ========================= */

.hero {
  margin-bottom: 18px;
}

.hero h1 {
  font-size: 2rem;
  margin: 0;
  font-weight: 800;
}

.hero p {
  color: #94a3b8;
  margin-top: 6px;
}

/* =========================
   GAME CARDS
   ========================= */

.game-card {
  margin-bottom: 20px;
  padding: 16px;
  border-radius: 18px;
  background: linear-gradient(180deg, #020617, #020617cc);
  border: 1px solid rgba(255,255,255,.07);
  box-shadow:
    0 10px 30px rgba(0,0,0,.45),
    inset 0 1px 0 rgba(255,255,255,.04);
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.teams {
  display: flex;
  align-items: center;
  gap: 8px;
}

.teams img {
  height: 28px;
  width: auto;
}

/* =========================
   MARKETS
   ========================= */

.markets-row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.market-box {
  padding: 12px;
  border-radius: 14px;
  background: linear-gradient(180deg, rgba(15,23,42,.9), rgba(15,23,42,.6));
  border: 1px solid rgba(255,255,255,.06);
}

.market-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 10px;
  border-radius: 10px;
  margin-top: 8px;
  background: rgba(255,255,255,.03);
}

/* =========================
   SIGNAL INTENSITY
   ========================= */

.signal-light {
  box-shadow: inset 0 0 0 1px rgba(16,185,129,.25);
}

.signal-medium {
  box-shadow: inset 0 0 0 1px rgba(16,185,129,.45);
  background: rgba(16,185,129,.08);
}

.signal-strong {
  background: linear-gradient(135deg, rgba(16,185,129,.25), rgba(16,185,129,.08));
  box-shadow: 0 0 18px rgba(16,185,129,.35);
}

/* =========================
   BADGES & TEXT
   ========================= */

.badge {
  padding: 4px 10px;
  border-radius: 999px;
  font-size: .75rem;
  background: rgba(16,185,129,.18);
  border: 1px solid rgba(16,185,129,.4);
}

.muted {
  color: #94a3b8;
  font-size: .8rem;
}

/* =========================
   EV COLORS
   ========================= */

.ev-green {
  color: #10b981;
}

.ev-red {
  color: #ef4444;
}

.ev-neutral {
  color: #facc15;
}

/* =========================
   LOADING STATE
   ========================= */

.loading {
  padding: 40px;
  text-align: center;
  font-weight: 600;
  color: #94a3b8;
}
