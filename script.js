import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
   ========================================================= */

const sport = document.body.dataset.sport || "nfl";
const API_EVENTS = sport === "nhl" ? "/api/events_nhl" : "/api/events";
const API_PROPS  = sport === "nhl" ? "/api/props_nhl" : "/api/props";

/* =========================================================
   NORMALIZATION
   ========================================================= */

function normalizeOutcome(o, type) {
  return {
    team: o.team || o.name || null,
    label: o.label || o.team || o.name || null,
    side: o.side || null,
    point: o.point ?? null,
    odds: o.odds ?? o.price,
    ev: Number.isFinite(o.ev) ? o.ev : 0,
    consensus: o.consensus_prob ?? o.consensus ?? null
  };
}

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function signalFromEV(ev) {
  if (Math.abs(ev) >= 0.08) return "HIGH";
  if (Math.abs(ev) >= 0.04) return "MED";
  if (Math.abs(ev) >= 0.015) return "LOW";
  return "MIN";
}

function signalClass(level) {
  return `signal-${level.toLowerCase()}`;
}

function badge(ev) {
  if (ev >= 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev <= -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
  return "";
}

function formatLabel(type, o) {
  if (type === "ml") return o.team;
  if (type === "spread" || type === "puck") {
    const s = o.point > 0 ? "+" : "";
    return `${o.team} ${s}${o.point}`;
  }
  if (type === "total") {
    return `${o.side} ${o.point}`;
  }
  if (type === "prop") return o.label;
  return "—";
}

/* =========================================================
   GAME SUMMARY (AUTHORITATIVE)
   ========================================================= */

function summarizeGame(game) {
  const candidates = [];

  const push = (type, o, side) => {
    if (!o || !Number.isFinite(o.ev)) return;
    candidates.push({
      type,
      team: o.team || o.name || o.label,
      side,
      ev: o.ev
    });
  };

  if (game.best?.ml) {
    push("ML", game.best.ml.away, "AWAY");
    push("ML", game.best.ml.home, "HOME");
  }

  if (game.best?.spread) {
    push("SPREAD", game.best.spread.away, "AWAY");
    push("SPREAD", game.best.spread.home, "HOME");
  }

  if (game.best?.puck) {
    push("PUCK", game.best.puck.away, "AWAY");
    push("PUCK", game.best.puck.home, "HOME");
  }

  if (game.best?.total) {
    push("TOTAL", game.best.total.over, "OVER");
    push("TOTAL", game.best.total.under, "UNDER");
  }

  if (!candidates.length) {
    return {
      team: "—",
      market: "—",
      strength: "MIN"
    };
  }

  const best = candidates.reduce((a, b) =>
    Math.abs(b.ev) > Math.abs(a.ev) ? b : a
  );

  return {
    team: best.team,
    market: best.type,
    strength: signalFromEV(best.ev)
  };
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

function renderRows(type, rows) {
  if (!rows?.length) return "";

  const norm = rows.map(o => normalizeOutcome(o, type));
  const evs = norm.map(o => o.ev).filter(Number.isFinite);
  const level = signalFromEV(Math.max(...evs.map(Math.abs)));

  return norm.map(o => `
    <div class="market-row ${signalClass(level)}">
      <div class="market-left">
        <span class="market-tag ${type}">${type.toUpperCase()}</span>
        <div class="market-team">${formatLabel(type, o)}</div>
        <div class="market-odds">${fmtOdds(o.odds)}</div>
        <div class="market-meta">
          Consensus ${o.consensus != null ? pct(o.consensus) : "—"} · EV ${pct(o.ev)}
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

  const groups = await fetchProps(gameId);

  if (!groups?.length) {
    el.innerHTML = `<div class="muted">No props available</div>`;
    return;
  }

  el.innerHTML = groups.map(g => {
    const norm = g.outcomes.map(o => normalizeOutcome(o, "prop"));
    const evs = norm.map(o => o.ev).filter(Number.isFinite);
    const level = signalFromEV(Math.max(...evs.map(Math.abs)));

    return `
      <div class="props-group">
        <div class="props-header">
          <span>${g.market}</span>
          <span class="signal-bubble ${signalClass(level)}">${level}</span>
        </div>
        ${renderRows("prop", norm)}
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
  const summary = summarizeGame(game);

  return `
    <section class="game-card">
      <header class="game-header">
        <div class="teams">
          ${away.logo ? `<img src="${away.logo}" />` : ""}
          <span>@</span>
          ${home.logo ? `<img src="${home.logo}" />` : ""}
        </div>

        <div class="game-summary ${signalClass(summary.strength)}">
          <span class="summary-label">Market Lean</span>
          <span class="summary-team">${summary.team}</span>
          <span class="summary-meta">${summary.market} · ${summary.strength}</span>
        </div>
      </header>

      ${renderRows("ml", game.best?.ml ? [
        game.best.ml.away,
        game.best.ml.home
      ] : [])}

      ${renderRows(
        sport === "nhl" ? "puck" : "spread",
        sport === "nhl"
          ? game.best?.puck ? [game.best.puck.away, game.best.puck.home] : []
          : game.best?.spread ? [game.best.spread.away, game.best.spread.home] : []
      )}

      ${renderRows("total", game.best?.total ? [
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
