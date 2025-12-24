import { Teams } from "./teams.js";

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

async function fetchGames() {
  const r = await fetch("/api/events");
  return await r.json();
}

function pickLabel(p) {
  if (p.type === "spread") return `${p.name} ${p.point > 0 ? "+" : ""}${p.point}`;
  if (p.type === "total") return `${p.side.toUpperCase()} ${p.point}`;
  return p.name;
}

function marketTag(type) {
  return type === "spread" ? "SPREAD" : type === "total" ? "TOTAL" : "ML";
}

function selectBestPick(game) {
  const all = [
    game.best.ml.home,
    game.best.ml.away,
    game.best.spread.home,
    game.best.spread.away,
    game.best.total.over,
    game.best.total.under
  ].filter(o => o && o.ev != null);

  // Preset the single strongest edge across ML, spread, and total
  all.sort((a, b) => b.ev - a.ev);
  return all[0] || null;
}

function renderGame(game) {
  const pick = selectBestPick(game);
  if (!pick) return null;

  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="matchup">
  <strong>${game.away_team} @ ${game.home_team}</strong>
  <span>${new Date(game.commence_time).toLocaleString()}</span>
</div>

    <div class="pick-strip">
      <div class="pick-market">${marketTag(pick.type)}</div>
      <div class="pick-selection">${pickLabel(pick)}</div>
      <div class="pick-odds">${fmtOdds(pick.odds)}</div>
      <div class="pick-metrics">
        <span>Model ${pct(pick.consensus_prob)}</span>
        <span class="${pick.ev > 0 ? "ev-green" : "ev-red"}">
          ${(pick.ev * 100).toFixed(2)}% EV
        </span>
      </div>
    </div>

    <div class="actions">
      <button class="props-btn">View Props</button>
    </div>

    <div class="props hidden">🔒 Props are monitored continuously. Top player props will surface when model edges emerge.</div>
  `;

  const btn = card.querySelector(".props-btn");
  const props = card.querySelector(".props");
  btn.onclick = async () => {
  props.classList.toggle("hidden");

  if (props.dataset.loaded) return;

  try {
    const r = await fetch(`/api/props?id=${game.id}`);
    const data = await r.json();

    const rows = Object.values(data.categories || {})
      .flat()
      .map(p => {
        const over = { side: "Over", ev: p.over_ev, odds: p.over_odds, point: p.point, player: p.player };
        const under = { side: "Under", ev: p.under_ev, odds: p.under_odds, point: p.point, player: p.player };
        return over.ev >= under.ev ? over : under;
      })
      .filter(p => p.ev > -0.01)
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 3);

    if (!rows.length) {
      props.innerHTML = "🔒 Props are monitored continuously. No strong edges detected yet.";
    } else {
      props.innerHTML = rows.map(p => `
        <div class=\"prop-row\">
          <span>${p.player} ${p.side} ${p.point}</span>
          <span>${fmtOdds(p.odds)}</span>
          <span class=\"ev-green\">${(p.ev * 100).toFixed(2)}%</span>
        </div>
      `).join("");
    }

    props.dataset.loaded = "1";
  } catch {
    props.innerHTML = "Unable to load props.";
  }
};

  return card;
}

(async function init() {
  const el = document.getElementById("games-container");
  el.innerHTML = "";
  const games = await fetchGames();

  games.forEach(g => {
    const card = renderGame(g);
    if (card) el.appendChild(card);
  });
})();fix the n
