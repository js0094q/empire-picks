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
   SIGNAL STRENGTH
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
  const url = SPORT === "nhl"
    ? "/api/events_nhl"
    : "/api/events";

  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to fetch games");
  return r.json();
}

/* =========================================================
   GENERIC MARKET RENDERER
   ========================================================= */

function renderMarketRows(type, label, rows) {
  const viable = rows.filter(
    o => o && Number.isFinite(o.odds) && Number.isFinite(o.consensus_prob)
  );
  if (!viable.length) return "";

  const evs = viable.map(o => o.ev).filter(Number.isFinite);
  const maxProb = Math.max(...viable.map(o => impliedProb(o.odds)));
  const maxEv = evs.length ? Math.max(...evs) : null;

  return viable.map(o => {
    const sig = signalFromEV(o.ev, evs);
    const booksFavor = impliedProb(o.odds) === maxProb;
    const bestValue =
      Number.isFinite(o.ev) && o.ev === maxEv && maxEv > 0;

    return `
      <div class="market-row ${bestValue ? "best-value" : ""}">
        <span class="market-tag ${type}">${label}</span>

        <div class="market-main">
          <div class="market-name">
            ${o.label}
            ${booksFavor ? `<span class="pill-mini pill-fav">BOOKS FAVOR</span>` : ""}
            ${bestValue ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
          </div>

          <div class="market-odds">${fmtOdds(o.odds)}</div>

          <div class="market-meta">
            Books ${pct(impliedProb(o.odds))}
            · Consensus ${pct(o.consensus_prob)}
            · Value ${Number.isFinite(o.ev) ? (o.ev * 100).toFixed(1) + "%" : "—"}
          </div>
        </div>

        <div class="signal-bubble ${sig.cls}">${sig.txt}</div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   MARKET TYPES
   ========================================================= */

function renderML(game) {
  const ml = game?.best?.ml;
  if (!ml?.home || !ml?.away) return "";

  return renderMarketRows("ml", "ML", [
    { ...ml.away, label: game.away_team },
    { ...ml.home, label: game.home_team }
  ]);
}

function renderSpreadOrPuck(game) {
  const m = SPORT === "nhl"
    ? game?.best?.puck
    : game?.best?.spread;

  if (!m?.home || !m?.away) return "";

  const tag = SPORT === "nhl" ? "PUCK" : "SPREAD";

  return renderMarketRows("spread", tag, [
    {
      ...m.away,
      label: `${game.away_team} ${m.away.point > 0 ? "+" : ""}${m.away.point}`
    },
    {
      ...m.home,
      label: `${game.home_team} ${m.home.point > 0 ? "+" : ""}${m.home.point}`
    }
  ]);
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
   GAME NARRATIVE
   ========================================================= */

function gameNarrative(game) {
  const mlH = game?.best?.ml?.home;
  const mlA = game?.best?.ml?.away;
  if (!mlH || !mlA) return "";

  const lean =
    mlH.consensus_prob > mlA.consensus_prob
      ? game.home_team
      : game.away_team;

  return `
    <div class="muted" style="margin:8px 0;font-size:0.8rem">
      Market pricing leans toward <b>${lean}</b>.
    </div>
  `;
}

/* =========================================================
   GAME CARD
   ========================================================= */

function gameCard(game) {
  const home = Teams?.[game.home_team];
  const away = Teams?.[game.away_team];

  const kickoff = game.commence_time
    ? new Date(game.commence_time).toLocaleString("en-US", {
        weekday: "short",
        hour: "numeric",
        minute: "2-digit"
      })
    : "—";

  return `
    <div class="game-card">
      <div class="game-header">
        <div class="teams">
          ${away?.logo ? `<img src="${away.logo}" />` : `<span>${game.away_team}</span>`}
          <span>@</span>
          ${home?.logo ? `<img src="${home.logo}" />` : `<span>${game.home_team}</span>`}
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>

      ${gameNarrative(game)}

      ${renderML(game)}
      ${renderSpreadOrPuck(game)}
      ${renderTotals(game)}
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  if (!container) return;

  try {
    const games = await fetchGames();
    container.innerHTML = games.map(gameCard).join("");
  } catch (e) {
    console.error(e);
    container.innerHTML =
      `<div class="muted">Failed to load games.</div>`;
  }
});
