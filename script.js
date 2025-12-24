import { Teams } from "./teams.js";

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

async function fetchGames() {
  const r = await fetch("/api/events");
  return await r.json();
}

function marketTag(type) {
  return type === "spread" ? "SPREAD" : type === "total" ? "TOTAL" : "ML";
}

function pickLabel(p) {
  if (p.type === "spread") return `${p.name} ${p.point > 0 ? "+" : ""}${p.point}`;
  if (p.type === "total") return `${p.side.toUpperCase()} ${p.point}`;
  return p.name;
}

function selectBestPick(game) {
  const all = [
    game.best.ml.home,
    game.best.ml.away,
    game.best.spread.home,
    game.best.spread.away,
    game.best.total.over,
    game.best.total.under
  ].filter(o => o && o.ev > 0);

  all.sort((a, b) => b.ev - a.ev);
  return all[0] || null;
}

function renderGame(game) {
  const pick = selectBestPick(game);
  if (!pick) return null;

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const card = document.createElement("div");
  card.className = "game-card";
  card.style.setProperty("--home-color", home?.color || "#334155");
  card.style.setProperty("--away-color", away?.color || "#475569");

  card.innerHTML = `
    <div class="card-bg home"></div>
    <div class="card-bg away"></div>

    <div class="matchup">
      <div class="teams">
        <img src="${away.logo}" />
        <span>@</span>
        <img src="${home.logo}" />
        <strong>${away.abbr} @ ${home.abbr}</strong>
      </div>
      <span>${new Date(game.commence_time).toLocaleString()}</span>
    </div>

    <div class="pick-strip">
      <div class="pick-market">${marketTag(pick.type)}</div>
      <div class="pick-selection">${pickLabel(pick)}</div>
      <div class="pick-odds">${fmtOdds(pick.odds)}</div>
      <div class="pick-metrics">
        <span>Model ${pct(pick.consensus_prob)}</span>
        <span class="ev-green">${(pick.ev * 100).toFixed(2)}% EV</span>
      </div>
    </div>

    <div class="why">
      Why: Model consensus diverges materially from market price
    </div>

    <div class="actions">
      <button class="props-btn">View Props</button>
    </div>

    <div class="props hidden">
      🔒 Props monitored. No +EV props detected yet.
    </div>
  `;

  const btn = card.querySelector(".props-btn");
  const props = card.querySelector(".props");
  btn.onclick = () => props.classList.toggle("hidden");

  return card;
}

(async function init() {
  const container = document.getElementById("games-container");
  container.innerHTML = "";

  const games = await fetchGames();
  games.forEach(g => {
    const card = renderGame(g);
    if (card) container.appendChild(card);
  });
})();
