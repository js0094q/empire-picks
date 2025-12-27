import { Teams } from "./teams.js";

/* =========================================================
   GLOBALS
   ========================================================= */

const SPORT = document.body?.dataset?.sport || "nfl";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x =>
  Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—";

const fmtOdds = o =>
  Number.isFinite(o) ? (o > 0 ? `+${o}` : `${o}`) : "—";

const impliedProb = o =>
  Number.isFinite(o)
    ? o > 0
      ? 100 / (o + 100)
      : Math.abs(o) / (Math.abs(o) + 100)
    : null;

/* =========================================================
   SIGNAL
   ========================================================= */

function signalFromEV(ev, all) {
  if (!Number.isFinite(ev) || all.length < 2)
    return { cls: "signal-weak", txt: "MIN" };

  const sorted = [...all].sort((a, b) => a - b);
  const rank = sorted.indexOf(ev) / (sorted.length - 1);

  if (rank >= 0.9) return { cls: "signal-very-strong", txt: "HIGH" };
  if (rank >= 0.7) return { cls: "signal-strong", txt: "MED" };
  if (rank >= 0.4) return { cls: "signal-moderate", txt: "LOW" };
  return { cls: "signal-weak", txt: "MIN" };
}

/* =========================================================
   FETCH
   ========================================================= */

async function fetchGames() {
  const url = SPORT === "nhl" ? "/api/events_nhl" : "/api/events";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed games");
  return r.json();
}

async function fetchProps(gameId) {
  const url =
    SPORT === "nhl"
      ? `/api/props_nhl?event_id=${gameId}`
      : `/api/props?event_id=${gameId}`;

  const r = await fetch(url);
  if (!r.ok) return [];
  return r.json();
}

/* =========================================================
   MARKETS
   ========================================================= */

function renderMarketRows(type, label, rows) {
  const viable = rows.filter(
    o => o && Number.isFinite(o.odds) && Number.isFinite(o.consensus_prob)
  );
  if (!viable.length) return "";

  const evs = viable.map(o => o.ev).filter(Number.isFinite);
  const maxEv = evs.length ? Math.max(...evs) : null;

  return viable.map(o => {
    const sig = signalFromEV(o.ev, evs);
    const best = o.ev === maxEv && maxEv > 0;

    return `
      <div class="market-row ${best ? "best-value" : ""}">
        <span class="market-tag ${type}">${label}</span>
        <div class="market-main">
          <div class="market-name">
            ${o.label}
            ${best ? `<span class="pill-mini pill-value">BEST</span>` : ""}
          </div>
          <div class="market-odds">${fmtOdds(o.odds)}</div>
          <div class="market-meta">
            Consensus ${pct(o.consensus_prob)} · EV ${
      Number.isFinite(o.ev) ? (o.ev * 100).toFixed(1) + "%" : "—"
    }
          </div>
        </div>
        <div class="signal-bubble ${sig.cls}">${sig.txt}</div>
      </div>
    `;
  }).join("");
}

function renderML(game) {
  const ml = game?.best?.ml;
  if (!ml?.home || !ml?.away) return "";

  return renderMarketRows("ml", "ML", [
    { ...ml.away, label: game.away_team },
    { ...ml.home, label: game.home_team }
  ]);
}

function renderSpreadOrPuck(game) {
  const m =
    SPORT === "nhl" ? game?.best?.puck : game?.best?.spread;
  if (!m?.home || !m?.away) return "";

  return renderMarketRows(
    "spread",
    SPORT === "nhl" ? "PUCK" : "SPREAD",
    [
      {
        ...m.away,
        label: `${game.away_team} ${m.away.point > 0 ? "+" : ""}${m.away.point}`
      },
      {
        ...m.home,
        label: `${game.home_team} ${m.home.point > 0 ? "+" : ""}${m.home.point}`
      }
    ]
  );
}

function renderTotals(game) {
  const t = game?.best?.total;
  if (!t?.over || !t?.under) return "";

  return renderMarketRows("total", "TOTAL", [
    { ...t.over, label: `Over ${t.over.point}` },
    { ...t.under, label: `Under ${t.under.point}` }
  ]);
}

/* =========================================================
   PROPS
   ========================================================= */

function propsContainer(gameId) {
  return `
    <button class="props-toggle" data-id="${gameId}">
      Show Props
    </button>
    <div class="props-list" id="props-${gameId}" hidden></div>
  `;
}

async function loadProps(gameId) {
  const wrap = document.getElementById(`props-${gameId}`);
  if (!wrap || wrap.dataset.loaded) return;

  const props = await fetchProps(gameId);
  wrap.dataset.loaded = "1";

  if (!props.length) {
    wrap.innerHTML = `<div class="muted">No props available</div>`;
    return;
  }

  wrap.innerHTML = props.map(p =>
    renderMarketRows("prop", p.market, p.outcomes)
  ).join("");
}

/* =========================================================
   GAME CARD
   ========================================================= */

function gameCard(game) {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  return `
    <div class="game-card">
      <div class="game-header">
        <div class="teams">
          ${away?.logo ? `<img src="${away.logo}" />` : ""}
          <span>${game.away_team}</span>
          <span>@</span>
          ${home?.logo ? `<img src="${home.logo}" />` : ""}
          <span>${game.home_team}</span>
        </div>
      </div>

      ${renderML(game)}
      ${renderSpreadOrPuck(game)}
      ${renderTotals(game)}

      ${propsContainer(game.id)}
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  const games = await fetchGames();
  container.innerHTML = games.map(gameCard).join("");

  document.addEventListener("click", async e => {
    const btn = e.target.closest(".props-toggle");
    if (!btn) return;

    const id = btn.dataset.id;
    const wrap = document.getElementById(`props-${id}`);
    wrap.hidden = !wrap.hidden;
    btn.textContent = wrap.hidden ? "Show Props" : "Hide Props";
    await loadProps(id);
  });
});
