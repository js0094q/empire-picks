import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
   ========================================================= */

const sport = document.body.dataset.sport || "nfl";
const API_EVENTS = sport === "nhl" ? "/api/events_nhl" : "/api/events";
const API_PROPS  = "/api/props";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function computeMarketSignal(groups) {
  const evs = groups
    .flat()
    .map(o => o?.ev)
    .filter(Number.isFinite);

  if (!evs.length) return { cls: "signal-weak", txt: "MIN" };

  const max = Math.max(...evs);
  if (max > 0.08) return { cls: "signal-very-strong", txt: "HIGH" };
  if (max > 0.04) return { cls: "signal-strong", txt: "MED" };
  if (max > 0.01) return { cls: "signal-moderate", txt: "LOW" };
  return { cls: "signal-weak", txt: "MIN" };
}

function badge(ev) {
  if (ev > 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev < -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
  return "";
}

/* =========================================================
   FETCHERS
   ========================================================= */

async function fetchGames() {
  const r = await fetch(API_EVENTS);
  return r.json();
}

async function fetchProps(eventId) {
  const r = await fetch(`${API_PROPS}?eventId=${eventId}`);
  return r.json();
}

/* =========================================================
   RENDER ROWS
   ========================================================= */

function renderMarketRows(type, label, rows) {
  if (!rows || !rows.length) return "";

  const signal = computeMarketSignal([rows]);

  return rows.map(o => `
    <div class="market-row ${signal.cls}">
      <div class="market-left">
        <span class="market-tag ${type}">${label}</span>
        <div class="market-team">${o.label || o.team}</div>
        <div class="market-odds">${fmtOdds(o.odds)}</div>
        <div class="market-meta">
          Consensus ${pct(o.consensus_prob)} · EV ${pct(o.ev)}
        </div>
      </div>
      <div class="market-right">
        ${badge(o.ev)}
        <span class="signal-bubble ${signal.cls}">${signal.txt}</span>
      </div>
    </div>
  `).join("");
}

/* =========================================================
   PROPS
   ========================================================= */

async function loadProps(gameId) {
  const el = document.getElementById(`props-${gameId}`);
  if (!el || el.dataset.loaded) return;
  el.dataset.loaded = "1";

  const groups = await fetchProps(gameId);

  if (!groups?.length) {
    el.innerHTML = `<div class="muted">No props available</div>`;
    return;
  }

  el.innerHTML = groups.map(g => {
    const signal = computeMarketSignal([g.outcomes]);
    return `
      <div class="props-group">
        <div class="props-header">
          <span>${g.market}</span>
          <span class="signal-bubble ${signal.cls}">${signal.txt}</span>
        </div>
        ${renderMarketRows("prop", "PROP", g.outcomes)}
      </div>
    `;
  }).join("");
}

/* =========================================================
   GAME CARD
   ========================================================= */

function gameCard(game) {
  const away = Teams[game.away_team] || {};
  const home = Teams[game.home_team] || {};

  const markets = [];

  if (game.best?.ml) markets.push(
    game.best.ml.away,
    game.best.ml.home
  );
  if (game.best?.spread) markets.push(
    game.best.spread.away,
    game.best.spread.home
  );
  if (game.best?.puck) markets.push(
    game.best.puck.away,
    game.best.puck.home
  );
  if (game.best?.total) markets.push(
    game.best.total.over,
    game.best.total.under
  );

  const signal = computeMarketSignal([markets]);

  return `
    <section class="game-card">
      <header class="game-header">
        <div class="teams">
          <img src="${away.logo || ""}" />
          <span>@</span>
          <img src="${home.logo || ""}" />
        </div>
        <div class="game-signal ${signal.cls}">
          Market Lean · <strong>${signal.txt}</strong>
        </div>
      </header>

      ${renderMarketRows("ml", "ML", game.best?.ml ? [
        game.best.ml.away,
        game.best.ml.home
      ] : [])}

      ${renderMarketRows(
        sport === "nhl" ? "puck" : "spread",
        sport === "nhl" ? "PUCK" : "SPREAD",
        game.best?.puck || game.best?.spread
          ? [game.best.puck?.away || game.best.spread?.away,
             game.best.puck?.home || game.best.spread?.home]
          : []
      )}

      ${renderMarketRows("total", "TOTAL", game.best?.total ? [
        game.best.total.over,
        game.best.total.under
      ] : [])}

      <button class="props-toggle"
        onclick="loadProps('${game.id}')">
        Show Props
      </button>

      <div id="props-${game.id}" class="props-wrap"></div>
    </section>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const wrap = document.getElementById("games-container");
  wrap.innerHTML = `<div class="loading">Loading ${sport.toUpperCase()} games…</div>`;

  const games = await fetchGames();
  wrap.innerHTML = games.map(gameCard).join("");
});
