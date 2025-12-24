import { Teams } from "./teams.js";

const MIN_PROB = 0.35;
const MAX_PROB = 0.75;
const MIN_STABILITY = 0.35;

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

async function fetchGames() {
  const r = await fetch("/api/events");
  return await r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  return await r.json();
}

function selectBestPick(game) {
  const c = [];

  const push = (type, side, o) => {
    if (!o || o.ev <= 0) return;
    if (o.consensus_prob < MIN_PROB || o.consensus_prob > MAX_PROB) return;
    if (o.stability < MIN_STABILITY) return;
    c.push({ type, side, ...o });
  };

  push("ml", "home", game.best.ml.home);
  push("ml", "away", game.best.ml.away);
  push("spread", "home", game.best.spread.home);
  push("spread", "away", game.best.spread.away);
  push("total", "over", game.best.total.over);
  push("total", "under", game.best.total.under);

  c.sort((a, b) => b.ev - a.ev);
  return c[0] || null;
}

function pickLabel(p) {
  if (p.type === "total") return `${p.side.toUpperCase()} ${p.point}`;
  if (p.type === "spread") return `${p.name} ${p.point > 0 ? "+" : ""}${p.point}`;
  return p.name;
}

function renderProps(categories) {
  return Object.entries(categories).map(([cat, list]) => {
    const top = list
      .map(p => {
        const over = { side: "Over", ev: p.over_ev, odds: p.over_odds };
        const under = { side: "Under", ev: p.under_ev, odds: p.under_odds };
        return over.ev > under.ev ? over : under;
      })
      .filter(x => x.ev > 0)
      .slice(0, 3);

    if (!top.length) {
      return `<div class="muted">${cat}: No +EV props</div>`;
    }

    return `
      <h4>${cat}</h4>
      ${top.map(p =>
        `<div class="prop-row">
          <span>${p.side}</span>
          <span>${fmtOdds(p.odds)}</span>
          <span class="ev-green">${(p.ev * 100).toFixed(2)}%</span>
        </div>`
      ).join("")}
    `;
  }).join("");
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  const games = await fetchGames();

  games.forEach(g => {
    const pick = selectBestPick(g);
    if (!pick) return;

    const home = Teams[g.home_team];
    const away = Teams[g.away_team];

    const card = document.createElement("div");
    card.className = "game-card";

    card.innerHTML = `
      <div class="game-header">
        <img src="${away.logo}" />
        <strong>${away.abbr} @ ${home.abbr}</strong>
        <img src="${home.logo}" />
      </div>

      <div class="pick-main">
        <strong>${pickLabel(pick)}</strong>
        <span>${fmtOdds(pick.odds)}</span>
      </div>

      <div class="pick-meta">
        Model ${pct(pick.consensus_prob)} • Edge ${(pick.ev * 100).toFixed(2)}%
      </div>

      <button class="props-btn">View Props</button>
      <div class="props hidden"></div>
    `;

    const btn = card.querySelector(".props-btn");
    const propsEl = card.querySelector(".props");

    btn.onclick = async () => {
      propsEl.classList.toggle("hidden");
      if (propsEl.dataset.loaded) return;
      const data = await fetchProps(g.id);
      propsEl.innerHTML = renderProps(data.categories);
      propsEl.dataset.loaded = "1";
    };

    container.appendChild(card);
  });
});
