import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
========================================================= */

// auto-refresh interval (milliseconds)
const AUTO_REFRESH_INTERVAL = 30 * 1000; // 30 seconds

// determine sport from body data attribute
const sport = (() => {
  const ds = document.body?.dataset?.sport;
  if (ds === "nhl" || ds === "nfl") return ds;
  return "nfl";
})();

// Odds API endpoints
const API_EVENTS =
  sport === "nhl" ? "/api/events_nhl" : "/api/events";
const API_PROPS = "/api/props"; // always this for both sports

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

function evBadge(ev) {
  if (!Number.isFinite(ev)) return "";
  if (ev >= 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev <= -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
  return "";
}

function safeName(o) {
  return o?.team || o?.name || o?.label || "—";
}

function marketTagLabel(type) {
  return type.toUpperCase();
}

/* =========================================================
   MARKET LEAN SUMMARY
========================================================= */

function summarizeGame(game) {
  const candidates = [];

  const push = (label, outcome) => {
    if (!outcome || !Number.isFinite(outcome.ev)) return;
    candidates.push({ label, ev: outcome.ev });
  };

  // ML outcomes
  if (game.best?.ml) {
    push(safeName(game.best.ml.away), game.best.ml.away);
    push(safeName(game.best.ml.home), game.best.ml.home);
  }

  // Spread or Puck
  if (sport === "nhl") {
    if (game.best?.puck) {
      push(safeName(game.best.puck.away), game.best.puck.away);
      push(safeName(game.best.puck.home), game.best.puck.home);
    }
  } else {
    if (game.best?.spread) {
      push(safeName(game.best.spread.away), game.best.spread.away);
      push(safeName(game.best.spread.home), game.best.spread.home);
    }
  }

  // Totals
  if (game.best?.total) {
    push(`Over ${game.best.total.over?.point}`, game.best.total.over);
    push(`Under ${game.best.total.under?.point}`, game.best.total.under);
  }

  if (!candidates.length) return { label: "—", strength: "MIN" };

  const best = candidates.reduce((a, b) =>
    Math.abs(b.ev) > Math.abs(a.ev) ? b : a
  );

  return {
    label: best.label,
    strength: signalFromEV(best.ev),
  };
}

/* =========================================================
   API CALLS
========================================================= */

async function fetchGames() {
  const r = await fetch(API_EVENTS);
  return r.json();
}

async function fetchProps(gameId) {
  // props uses `?id=`
  const r = await fetch(`${API_PROPS}?id=${encodeURIComponent(gameId)}`);
  return r.json();
}

/* =========================================================
   RENDER FUNCTION
   Render up to top 3 markets for brevity/clarity
========================================================= */

function renderRows(type, rows) {
  if (!Array.isArray(rows) || !rows.length) return "";

  // sort outcomes by abs(ev) descending
  const sorted = rows
    .filter(Boolean)
    .sort((a, b) => Math.abs(b.ev || 0) - Math.abs(a.ev || 0))
    .slice(0, 3); // keep top 3

  const level = signalFromEV(
    Math.max(...sorted.map(o => Math.abs(o.ev || 0)), 0)
  );

  return sorted.map(o => `
    <div class="market-row ${signalClass(level)}">
      <div class="market-left">
        <span class="market-tag ${type}">${marketTagLabel(type)}</span>
        <div class="market-team">${safeName(o)}${o.point != null ? ` ${o.point > 0 ? "+" : ""}${o.point}` : ""}</div>
        <div class="market-odds">${fmtOdds(o.odds)}</div>
        <div class="market-meta">
          Consensus ${pct(o.consensus_prob)} · EV ${pct(o.ev)}
        </div>
      </div>
      <div class="market-right">
        ${evBadge(o.ev)}
        <span class="signal-bubble ${signalClass(level)}">${level}</span>
      </div>
    </div>
  `).join("");
}

/* =========================================================
   PROPS RENDERING (WORKING FOR BOTH SPORTS)
========================================================= */

function normalizePropOutcome(o) {
  return {
    label: o.label || o.name || "—",
    odds: o.odds ?? o.price ?? null,
    ev: Number.isFinite(o.ev) ? o.ev : null,
    consensus_prob: o.consensus_prob ?? o.consensus ?? null,
  };
}

async function loadProps(gameId) {
  const container = document.getElementById(`props-${gameId}`);
  if (!container) return;

  // toggle open/close
  if (container.dataset.open === "1") {
    container.innerHTML = "";
    container.dataset.open = "0";
    return;
  }

  container.innerHTML = `<div class="loading small">Loading props…</div>`;
  container.dataset.open = "1";

  try {
    const data = await fetchProps(gameId);
    const cats = data.categories || {};

    if (!Object.keys(cats).length) {
      container.innerHTML = `<div class="muted">No props available</div>`;
      return;
    }

    container.innerHTML = Object.entries(cats).map(([market, list]) => {
      const outcomes = list.map(normalizePropOutcome);
      return `
        <div class="props-group">
          <div class="props-header">
            <span>${market}</span>
            <span class="signal-bubble ${signalClass(
              signalFromEV(Math.max(...outcomes.map(o => Math.abs(o.ev || 0))))
            )}">
              ${signalFromEV(Math.max(...outcomes.map(o => Math.abs(o.ev || 0))))}
            </span>
          </div>
          <div class="props-rows">
            ${outcomes.map(o => `
              <div class="market-row prop ${signalClass(
                signalFromEV(Math.abs(o.ev || 0))
              )}">
                <div class="market-left">
                  <span class="market-tag prop">PROP</span>
                  <div class="market-team">${o.label}</div>
                  <div class="market-odds">${fmtOdds(o.odds)}</div>
                  <div class="market-meta">
                    Consensus ${pct(o.consensus_prob)} · EV ${pct(o.ev)}
                  </div>
                </div>
                <div class="market-right">
                  ${evBadge(o.ev)}
                  <span class="signal-bubble ${signalClass(
                    signalFromEV(Math.abs(o.ev || 0))
                  )}">
                    ${signalFromEV(Math.abs(o.ev || 0))}
                  </span>
                </div>
              </div>
            `).join("")}
          </div>
        </div>
      `;
    }).join("");

  } catch (err) {
    container.innerHTML = `<div class="muted">Props failed to load</div>`;
  }
}

/* =========================================================
   GAME CARD TEMPLATE
========================================================= */

function gameCard(game) {
  const lean = summarizeGame(game);

  const mlRows = [
    game.best?.ml?.away,
    game.best?.ml?.home
  ].filter(Boolean);

  const spreadOrPuckRows = sport === "nhl"
    ? [game.best?.puck?.away, game.best?.puck?.home].filter(Boolean)
    : [game.best?.spread?.away, game.best?.spread?.home].filter(Boolean);

  const totalRows = [
    game.best?.total?.over,
    game.best?.total?.under
  ].filter(Boolean);

  return `
    <section class="game-card">
      <header class="game-header">
        <div class="teams">
          <img class="team-logo" src="${Teams[game.away_team]?.logo || ""}" />
          <span>@</span>
          <img class="team-logo" src="${Teams[game.home_team]?.logo || ""}" />
        </div>

        <div class="game-summary ${signalClass(lean.strength)}">
          <span class="summary-label">Market Lean</span> 
          <span class="summary-team">${lean.label}</span>
          <span class="summary-meta">${lean.strength}</span>
        </div>
      </header>

      ${renderRows("ml", mlRows)}
      ${renderRows(sport === "nhl" ? "puck" : "spread", spreadOrPuckRows)}
      ${renderRows("total", totalRows)}

      <button class="props-toggle" onclick="loadProps('${game.id}')">
        Show Props
      </button>

      <div id="props-${game.id}" class="props-wrap"></div>
    </section>
  `;
}

/* =========================================================
   AUTO REFRESH + BOOTSTRAP
========================================================= */

async function loadGames() {
  const wrap = document.getElementById("games-container");
  wrap.innerHTML = `<div class="loading">Loading ${sport.toUpperCase()} games…</div>`;

  try {
    const games = await fetchGames();
    wrap.innerHTML = games.map(gameCard).join("");
  } catch (e) {
    wrap.innerHTML = `<div class="muted">Failed to load games.</div>`;
  }
}

document.addEventListener("DOMContentLoaded", () => {
  loadGames();
  setInterval(loadGames, AUTO_REFRESH_INTERVAL);
});
