import { Teams } from "./teams.js";

/* =========================================================
   CONFIG
========================================================= */

const sport = document.body.dataset.sport || "nfl";

const API_EVENTS = sport === "nhl" ? "/api/events_nhl" : "/api/events";
const API_PROPS = "/api/props";

const POLL_INTERVAL = 15_000; // 15 second polling

/* =========================================================
   HELPERS
========================================================= */

const pct = x =>
  Number.isFinite(x) ? (x * 100).toFixed(1) : null;

const fmtOdds = o =>
  Number.isFinite(o) ? (o > 0 ? `+${o}` : `${o}`) : "—";

function signalFromEV(ev) {
  const a = Math.abs(ev || 0);
  if (a >= 0.08) return "HIGH";
  if (a >= 0.04) return "MED";
  if (a >= 0.015) return "LOW";
  return "MIN";
}

function signalClass(ev) {
  return `signal-${signalFromEV(ev).toLowerCase()}`;
}

function evBadge(ev) {
  if (!Number.isFinite(ev)) return "";
  if (ev >= 0.04) return `<span class="badge badge-best">BEST VALUE</span>`;
  if (ev <= -0.04) return `<span class="badge badge-fade">BOOKS FAVOR</span>`;
  return "";
}

function safeTeamName(o) {
  return o?.team || o?.name || o?.label || "";
}

function teamLogoOrInitials(team) {
  const lookup = Teams[team];
  if (lookup && lookup.logo) {
    return `<img class="team-logo" src="${lookup.logo}" alt="${team}" />`;
  }
  // fallback: initials
  const initials = team
    .split(" ")
    .map(w => w[0])
    .join("")
    .toUpperCase();
  return `<span class="team-initials">${initials}</span>`;
}

/* =========================================================
   FETCH
========================================================= */
async function fetchJSON(url) {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function fetchGames() {
  return fetchJSON(API_EVENTS);
}

async function fetchProps(gameId) {
  return fetchJSON(`${API_PROPS}?id=${encodeURIComponent(gameId)}`);
}

/* =========================================================
   NORMALIZATION
========================================================= */
function normalizeOutcome(raw, fallback, type) {
  if (!raw) return null;

  let label;
  if (type === "ml") {
    label = safeTeamName(raw) || fallback;
  } else if (type === "spread" || type === "puck") {
    const pt = raw.point ?? null;
    label = `${fallback}${pt != null ? ` ${pt > 0 ? "+" : ""}${pt}` : ""}`;
  } else if (type === "total") {
    label = `${raw.name || ""} ${raw.point ?? ""}`.trim();
  } else {
    label = raw.label || raw.name || fallback;
  }

  return {
    label,
    odds: raw.odds ?? raw.price,
    ev: raw.ev ?? 0,
    consensus: raw.consensus_prob ?? raw.consensus ?? 0
  };
}

/* =========================================================
   CONSENSUS BARS
========================================================= */
function consensusBar(c) {
  if (!Number.isFinite(c)) return "";
  const width = Math.max(0, Math.min(100, c * 100));
  return `
    <div class="consensus-bar">
      <div class="consensus-fill" style="width: ${width}%;"></div>
      <span class="consensus-text">${width.toFixed(0)}%</span>
    </div>`;
}

/* =========================================================
   MARKET ROW
========================================================= */
function renderMarketRow(type, outcome) {
  if (!outcome) return "";
  const cls = signalClass(outcome.ev);
  return `
    <div class="market-row ${cls}">
      <div class="market-left">
        <span class="market-tag ${type}">${type.toUpperCase()}</span>
        <div class="market-team">${outcome.label}</div>
        <div class="market-odds">${fmtOdds(outcome.odds)}</div>
        <div class="market-meta">
          ${consensusBar(outcome.consensus)}
          EV ${pct(outcome.ev)}
        </div>
      </div>
      <div class="market-right">
        ${evBadge(outcome.ev)}
        <span class="signal-bubble ${cls}">${signalFromEV(outcome.ev)}</span>
      </div>
    </div>`;
}

/* =========================================================
   GAME CARDS
========================================================= */

function summarizeGame(game) {
  const list = [];

  if (game.best?.ml) {
    list.push(
      normalizeOutcome(game.best.ml.away, game.away_team, "ml"),
      normalizeOutcome(game.best.ml.home, game.home_team, "ml")
    );
  }

  if (sport === "nhl") {
    if (game.best?.puck) {
      list.push(
        normalizeOutcome(game.best.puck.away, game.away_team, "puck"),
        normalizeOutcome(game.best.puck.home, game.home_team, "puck")
      );
    }
  } else {
    if (game.best?.spread) {
      list.push(
        normalizeOutcome(game.best.spread.away, game.away_team, "spread"),
        normalizeOutcome(game.best.spread.home, game.home_team, "spread")
      );
    }
  }

  if (game.best?.total) {
    list.push(
      normalizeOutcome(game.best.total.over, "Over", "total"),
      normalizeOutcome(game.best.total.under, "Under", "total")
    );
  }

  if (!list.length) return { team: "—", signal: "MIN" };

  const best = list.reduce((a, b) =>
    Math.abs(b.ev) > Math.abs(a.ev) ? b : a
  );

  return { team: best.label, signal: signalFromEV(best.ev) };
}

function gameCard(game) {
  const lean = summarizeGame(game);

  const mlRows = [
    normalizeOutcome(game.best?.ml?.away, game.away_team, "ml"),
    normalizeOutcome(game.best?.ml?.home, game.home_team, "ml")
  ].filter(x => x);

  const spRows = sport === "nhl"
    ? [
        normalizeOutcome(game.best?.puck?.away, game.away_team, "puck"),
        normalizeOutcome(game.best?.puck?.home, game.home_team, "puck")
      ]
    : [
        normalizeOutcome(game.best?.spread?.away, game.away_team, "spread"),
        normalizeOutcome(game.best?.spread?.home, game.home_team, "spread")
      ];

  const totRows = [
    normalizeOutcome(game.best?.total?.over, "Over", "total"),
    normalizeOutcome(game.best?.total?.under, "Under", "total")
  ].filter(x => x);

  const allMarkets = [...mlRows, ...spRows, ...totRows]
    .filter(x => x)
    .sort((a, b) => Math.abs(b.ev) - Math.abs(a.ev));

  const top3 = allMarkets.slice(0, 3);

  return `
    <section class="game-card">
      <header class="game-header">
        <div class="teams">
          ${teamLogoOrInitials(game.away_team)}
          <span class="at">@</span>
          ${teamLogoOrInitials(game.home_team)}
        </div>

        <div class="lean-indicator signal-${lean.signal.toLowerCase()}">
          Market Lean: ${lean.team}
        </div>
      </header>

      <div class="market-list">
        ${top3.map(o => renderMarketRow(o.label.toLowerCase().includes("ml") ? "ml" : (sport==="nhl"?"puck":"spread"), o)).join("")}
      </div>

      ${allMarkets.length > 3 ? `<button class="toggle-all">View All</button>` : ""}

      <button class="props-toggle" data-id="${game.id}">Show Props</button>
      <div id="props-${game.id}" class="props-wrap"></div>
    </section>`;
}

/* =========================================================
   PROPS
========================================================= */

function normalizeProp(o) {
  return {
    label: o.label || o.name,
    odds: o.odds ?? o.price ?? null,
    ev: o.ev ?? 0,
    consensus: o.consensus_prob ?? o.consensus ?? 0
  };
}

async function loadProps(gameId) {
  const wrap = document.getElementById(`props-${gameId}`);
  const open = wrap.dataset.open === "1";

  if (open) {
    wrap.dataset.open = "0";
    wrap.innerHTML = "";
    return;
  }

  wrap.innerHTML = `<div class="loading small">Loading props…</div>`;
  wrap.dataset.open = "1";

  const data = await fetchProps(gameId).catch(() => null);
  if (!data || !data.categories) {
    wrap.innerHTML = `<div class="muted">No props</div>`;
    return;
  }

  const cats = Object.entries(data.categories);

  wrap.innerHTML = cats.map(([market, arr]) => {
    const outs = arr.map(normalizeProp);

    return `
      <div class="props-group">
        <div class="props-header">${market}
          <select class="prop-ev-filter">
            <option value="all">All</option>
            <option value="high">EV ≥ 4%</option>
            <option value="med">EV ≥ 2%</option>
          </select>
        </div>
        <div class="props-rows">
          ${outs.map(o => renderMarketRow("prop", o)).join("")}
        </div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   EVENT DELEGATION
========================================================= */

document.addEventListener("click", e => {
  if (e.target.closest(".props-toggle")) {
    const id = e.target.closest(".props-toggle").dataset.id;
    loadProps(id);
  }

  if (e.target.closest(".toggle-all")) {
    const section = e.target.closest(".game-card");
    const list = section.querySelector(".market-list");
    if (list.dataset.expanded === "1") {
      list.innerHTML = section.dataset.top3html;
      list.dataset.expanded = "0";
      e.target.textContent = "View All";
    } else {
      const id = section.querySelector(".props-toggle").dataset.id;
      fetchGames().then(games => {
        const game = games.find(g => g.id === id);
        const allMarkets = [...(game.best.ml ? [game.best.ml.away, game.best.ml.home] : []),
                            ...(sport==="nhl" ? 
                              [game.best.puck.away, game.best.puck.home] :
                              [game.best.spread.away, game.best.spread.home]),
                            ...(game.best.total ? [game.best.total.over, game.best.total.under] : [])]
                          .map(o => normalizeOutcome(o, "", ""))
                          .sort((a,b) => Math.abs(b.ev)-Math.abs(a.ev))
                          .map(o => renderMarketRow("prop", o))
                          .join("");
        section.dataset.top3html = list.innerHTML;
        list.innerHTML = allMarkets;
        list.dataset.expanded = "1";
        e.target.textContent = "Show Less";
    });
  }
});

document.addEventListener("change", e => {
  if (e.target.closest(".prop-ev-filter")) {
    const filter = e.target.value;
    const rows = [...e.target.closest(".props-group").querySelectorAll(".market-row.prop")];
    rows.forEach(r => {
      const ev = parseFloat(r.querySelector(".market-meta").textContent.split("EV")[1]) || 0;
      r.style.display = (
        filter==="all" ||
        (filter==="high" && ev>=0.04) ||
        (filter==="med" && ev>=0.02)
      ) ? "" : "none";
    });
  }
});

/* =========================================================
   POLLING
========================================================= */

async function refreshUI() {
  const container = document.getElementById("games-container");
  const games = await fetchGames().catch(() => []);

  container.innerHTML = games.map(gameCard).join("");
}

document.addEventListener("DOMContentLoaded", () => {
  refreshUI();
  setInterval(refreshUI, POLL_INTERVAL);
});
