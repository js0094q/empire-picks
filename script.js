import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
   ========================================================= */

const sport = document.body.dataset.sport || "nfl";
const API_EVENTS = sport === "nhl" ? "/api/events_nhl" : "/api/events";
const API_PROPS = "/api/props";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function formatOutcomeLabel(type, o) {
  if (type === "ml") return o.team;

  if (type === "spread" || type === "puck") {
    const sign = o.point > 0 ? "+" : "";
    return `${o.team} ${sign}${o.point}`;
  }

  if (type === "total") {
    return `${o.side} ${o.point}`;
  }

  if (type === "prop") {
    return o.label;
  }

  return "—";
}

function computeSignal(evs) {
  if (!evs.length) return { cls: "signal-min", txt: "MIN" };

  const max = Math.max(...evs);
  if (max >= 0.08) return { cls: "signal-high", txt: "HIGH" };
  if (max >= 0.04) return { cls: "signal-med", txt: "MED" };
  if (max >= 0.015) return { cls: "signal-low", txt: "LOW" };
  return { cls: "signal-min", txt: "MIN" };
}

function badge(ev) {
  if (ev >= 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev <= -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
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
   MARKET ROWS
   ========================================================= */

function renderMarketRows(type, rows) {
  if (!rows || !rows.length) return "";

  const evs = rows.map(o => o.ev).filter(Number.isFinite);
  const signal = computeSignal(evs);

  return rows.map(o => `
    <div class="market-row ${signal.cls}">
      <div class="market-left">
        <span class="market-tag ${type}">${type.toUpperCase()}</span>
        <div class="market-team">${formatOutcomeLabel(type, o)}</div>
        <div class="market-odds">${fmtOdds(o.odds)}</div>
        <div class="market-meta">
          Books ${pct(o.book_prob)} · Consensus ${pct(o.consensus_prob)} · EV ${pct(o.ev)}
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

  if (!groups || !groups.length) {
    el.innerHTML = `<div class="muted">No props available</div>`;
    return;
  }

  el.innerHTML = groups.map(g => {
    const evs = g.outcomes.map(o => o.ev).filter(Number.isFinite);
    const signal = computeSignal(evs);

    return `
      <div class="props-group">
        <div class="props-header">
          <span>${g.market}</span>
          <span class="signal-bubble ${signal.cls}">${signal.txt}</span>
        </div>
        ${renderMarketRows("prop", g.outcomes)}
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

  const allOutcomes = [];

  if (game.best?.ml) allOutcomes.push(game.best.ml.away, game.best.ml.home);
  if (game.best?.spread) allOutcomes.push(game.best.spread.away, game.best.spread.home);
  if (game.best?.puck) allOutcomes.push(game.best.puck.away, game.best.puck.home);
  if (game.best?.total) allOutcomes.push(game.best.total.over, game.best.total.under);

  const evs = allOutcomes.map(o => o.ev).filter(Number.isFinite);
  const gameSignal = computeSignal(evs);

  return `
    <section class="game-card">
      <header class="game-header">
        <div class="teams">
          ${away.logo ? `<img src="${away.logo}" />` : ""}
          <span>@</span>
          ${home.logo ? `<img src="${home.logo}" />` : ""}
        </div>
        <div class="game-signal ${gameSignal.cls}">
          Market Lean · <strong>${gameSignal.txt}</strong>
        </div>
      </header>

      ${renderMarketRows("ml", game.best?.ml ? [
        game.best.ml.away,
        game.best.ml.home
      ] : [])}

      ${renderMarketRows(
        sport === "nhl" ? "puck" : "spread",
        sport === "nhl"
          ? game.best?.puck ? [game.best.puck.away, game.best.puck.home] : []
          : game.best?.spread ? [game.best.spread.away, game.best.spread.home] : []
      )}

      ${renderMarketRows("total", game.best?.total ? [
        game.best.total.over,
        game.best.total.under
      ] : [])}

      <button class="props-toggle" onclick="loadProps('${game.id}')">
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
