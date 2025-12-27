import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
========================================================= */

const sport = document.body.dataset.sport || "nfl";
const API_EVENTS = sport === "nhl" ? "/api/events_nhl" : "/api/events";
// Props always use the same endpoint with `?id=` query
const API_PROPS = "/api/props";

/* =========================================================
   HELPERS
========================================================= */

const pct = x =>
  Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—";

const fmtOdds = o =>
  Number.isFinite(o) ? (o > 0 ? `+${o}` : `${o}`) : "—";

function signalFromEV(ev) {
  const a = Math.abs(ev || 0);
  if (a >= 0.08) return "HIGH";
  if (a >= 0.04) return "MED";
  if (a >= 0.015) return "LOW";
  return "MIN";
}

function signalClass(level) {
  return `signal-${String(level).toLowerCase()}`;
}

function badge(ev) {
  if (!Number.isFinite(ev)) return "";
  if (ev >= 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev <= -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
  return "";
}

/* =========================================================
   GAME SUMMARY
========================================================= */

function summarizeGame(game) {
  const allOutcomes = [];

  const push = (label, outcome) => {
    if (!outcome || !Number.isFinite(outcome.ev)) return;
    allOutcomes.push({ label, ev: outcome.ev });
  };

  if (game.best?.ml) {
    push(game.best.ml.away?.name || game.away_team, game.best.ml.away);
    push(game.best.ml.home?.name || game.home_team, game.best.ml.home);
  }

  if (sport === "nhl" && game.best?.puck) {
    push(game.best.puck.away?.name || game.away_team, game.best.puck.away);
    push(game.best.puck.home?.name || game.home_team, game.best.puck.home);
  }

  if (sport !== "nhl" && game.best?.spread) {
    push(game.best.spread.away?.name || game.away_team, game.best.spread.away);
    push(game.best.spread.home?.name || game.home_team, game.best.spread.home);
  }

  if (game.best?.total) {
    push("Over", game.best.total.over);
    push("Under", game.best.total.under);
  }

  if (!allOutcomes.length) return { label: "—", strength: "MIN" };

  const best = allOutcomes.reduce((a, b) =>
    Math.abs(b.ev) > Math.abs(a.ev) ? b : a
  );

  return {
    label: best.label,
    strength: signalFromEV(best.ev),
  };
}

/* =========================================================
   FETCHERS
========================================================= */

async function fetchGames() {
  const r = await fetch(API_EVENTS);
  return r.json();
}

async function fetchProps(gameId) {
  const r = await fetch(`${API_PROPS}?id=${encodeURIComponent(gameId)}`);
  return r.json();
}

/* =========================================================
   MARKET ROWS
========================================================= */

function renderRows(type, rows = []) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const level = signalFromEV(
    Math.max(...rows.map(o => Math.abs(o.ev || 0)))
  );

  return rows.map(o => `
    <div class="market-row ${signalClass(level)}">
      <div class="market-left">
        <span class="market-tag ${type}">${type.toUpperCase()}</span>
        <div class="market-team">${o.name || "—"}${o.point != null ? ` ${o.point > 0 ? "+" : ""}${o.point}` : ""}</div>
        <div class="market-odds">${fmtOdds(o.odds)}</div>
        <div class="market-meta">
          Consensus ${pct(o.consensus_prob)} · EV ${pct(o.ev)}
        </div>
      </div>
      <div class="market-right">
        ${badge(o.ev)}
        <span class="signal-bubble ${signalClass(level)}">${level}</span>
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
  el.innerHTML = `<div class="loading">Loading props…</div>`;

  let data;
  try {
    data = await fetchProps(gameId);
  } catch (err) {
    el.innerHTML = `<div class="muted">Props error</div>`;
    return;
  }

  // props endpoint returns { categories: { ... } }
  const categories = data.categories || {};
  const keys = Object.keys(categories);

  if (!keys.length) {
    el.innerHTML = `<div class="muted">No props available</div>`;
    return;
  }

  el.innerHTML = keys.map(market => {
    const outcomes = categories[market].map(item => ({
      name: item.label || item.player || "—",
      odds: item.odds ?? item.price,
      ev: item.ev,
      consensus_prob: item.consensus_prob ?? item.consensus
    }));

    const level = signalFromEV(
      Math.max(...outcomes.map(o => Math.abs(o.ev || 0)))
    );

    return `
      <div class="props-group">
        <div class="props-header">
          <span>${market}</span>
          <span class="signal-bubble ${signalClass(level)}">${level}</span>
        </div>
        ${renderRows("prop", outcomes)}
      </div>
    `;
  }).join("");
}

/* =========================================================
   GAME CARD
========================================================= */

function gameCard(game) {
  const awayLogo = Teams[game.away_team]?.logo || "";
  const homeLogo = Teams[game.home_team]?.logo || "";
  const summary = summarizeGame(game);

  return `
    <section class="game-card">
      <header class="game-header">
        <div class="teams">
          ${awayLogo ? `<img src="${awayLogo}" />` : ""}
          <span>@</span>
          ${homeLogo ? `<img src="${homeLogo}" />` : ""}
        </div>

        <div class="game-summary ${signalClass(summary.strength)}">
          <span class="summary-label">Market Lean</span>
          <span class="summary-team">${summary.label}</span>
          <span class="summary-meta">${summary.strength}</span>
        </div>
      </header>

      ${renderRows("ml", [
        game.best?.ml?.away,
        game.best?.ml?.home
      ].filter(Boolean))}

      ${sport === "nhl"
        ? renderRows("puck", [
            game.best?.puck?.away,
            game.best?.puck?.home
          ].filter(Boolean))
        : renderRows("spread", [
            game.best?.spread?.away,
            game.best?.spread?.home
          ].filter(Boolean))
      }

      ${renderRows("total", [
        game.best?.total?.over,
        game.best?.total?.under
      ].filter(Boolean))}

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
