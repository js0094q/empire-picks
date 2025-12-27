import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
   ========================================================= */

const sport = document.body.dataset.sport || "nfl";

const API_EVENTS =
  sport === "nhl" ? "/api/events_nhl" : "/api/events";

const API_PROPS =
  sport === "nhl" ? "/api/props_nhl" : "/api/props";

/* =========================================================
   SAFE HELPERS
   ========================================================= */

const pct = x =>
  Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—";

const fmtOdds = o =>
  typeof o === "number" ? (o > 0 ? `+${o}` : `${o}`) : "—";

function signalFromEV(ev) {
  if (!Number.isFinite(ev)) return "MIN";
  const a = Math.abs(ev);
  if (a >= 0.08) return "HIGH";
  if (a >= 0.04) return "MED";
  if (a >= 0.015) return "LOW";
  return "MIN";
}

function signalClass(level) {
  return `signal-${level.toLowerCase()}`;
}

function badge(ev) {
  if (!Number.isFinite(ev)) return "";
  if (ev >= 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev <= -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
  return "";
}

/* =========================================================
   NORMALIZATION (THE FIX)
   ========================================================= */

function normalizeOutcome(o = {}, fallbackTeam = "") {
  const team =
    o.team ||
    o.name ||
    o.label ||
    fallbackTeam ||
    "—";

  return {
    team,
    label: o.label || team,
    side: o.side || null,
    point: Number.isFinite(o.point) ? o.point : null,
    odds: Number.isFinite(o.odds) ? o.odds : Number(o.price),
    ev: Number.isFinite(o.ev) ? o.ev : 0,
    consensus: Number.isFinite(o.consensus_prob)
      ? o.consensus_prob
      : Number.isFinite(o.consensus)
      ? o.consensus
      : null
  };
}

/* =========================================================
   GAME SUMMARY (MARKET LEAN)
   ========================================================= */

function summarizeGame(game) {
  const candidates = [];

  const collect = (type, o, team) => {
    if (!o || !Number.isFinite(o.ev)) return;
    candidates.push({ type, team, ev: o.ev });
  };

  if (game.best?.ml) {
    collect("ML", game.best.ml.away, game.away_team);
    collect("ML", game.best.ml.home, game.home_team);
  }

  if (game.best?.spread) {
    collect("SPREAD", game.best.spread.away, game.away_team);
    collect("SPREAD", game.best.spread.home, game.home_team);
  }

  if (game.best?.puck) {
    collect("PUCK", game.best.puck.away, game.away_team);
    collect("PUCK", game.best.puck.home, game.home_team);
  }

  if (game.best?.total) {
    collect("TOTAL", game.best.total.over, "Over");
    collect("TOTAL", game.best.total.under, "Under");
  }

  if (!candidates.length) {
    return { team: "—", market: "—", strength: "MIN" };
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

async function fetchProps(gameId) {
  const r = await fetch(`${API_PROPS}?eventId=${gameId}`);
  return r.json();
}

/* =========================================================
   MARKET ROW RENDER
   ========================================================= */

function renderRows(type, rows, fallbackTeam) {
  if (!Array.isArray(rows) || !rows.length) return "";

  const norm = rows.map(o => normalizeOutcome(o, fallbackTeam));
  const evs = norm.map(o => o.ev).filter(Number.isFinite);
  const level = signalFromEV(Math.max(...evs.map(Math.abs)));

  return norm
    .map(
      o => `
    <div class="market-row ${signalClass(level)}">
      <div class="market-left">
        <span class="market-tag ${type}">${type.toUpperCase()}</span>
        <div class="market-team">${o.label}</div>
        <div class="market-odds">${fmtOdds(o.odds)}</div>
        <div class="market-meta">
          Consensus ${pct(o.consensus)} · EV ${pct(o.ev)}
        </div>
      </div>
      <div class="market-right">
        ${badge(o.ev)}
        <span class="signal-bubble ${signalClass(level)}">${level}</span>
      </div>
    </div>
  `
    )
    .join("");
}

/* =========================================================
   PROPS
   ========================================================= */

async function loadProps(gameId) {
  const el = document.getElementById(`props-${gameId}`);
  if (!el || el.dataset.loaded) return;

  el.dataset.loaded = "1";
  el.innerHTML = `<div class="loading">Loading props…</div>`;

  const groups = await fetchProps(gameId);

  if (!groups || !groups.length) {
    el.innerHTML = `<div class="muted">No props available</div>`;
    return;
  }

  el.innerHTML = groups
    .map(g => {
      const norm = g.outcomes.map(o => normalizeOutcome(o));
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
    })
    .join("");
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
        <span class="summary-meta">
          ${summary.market} · ${summary.strength}
        </span>
      </div>
    </header>

    ${renderRows("ml", [
      game.best?.ml?.away,
      game.best?.ml?.home
    ], game.away_team)}

    ${renderRows(
      sport === "nhl" ? "puck" : "spread",
      sport === "nhl"
        ? [game.best?.puck?.away, game.best?.puck?.home]
        : [game.best?.spread?.away, game.best?.spread?.home],
      game.away_team
    )}

    ${renderRows("total", [
      game.best?.total?.over,
      game.best?.total?.under
    ])}

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
