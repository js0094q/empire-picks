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
