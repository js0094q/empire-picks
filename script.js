import { Teams } from "./teams.js";

/* =========================================================
   BASIC HELPERS
   ========================================================= */

const pct = x => (Number.isFinite(x) ? (x * 100).toFixed(1) + "%" : "—");
const fmtOdds = o => (Number.isFinite(o) ? (o > 0 ? `+${o}` : `${o}`) : "—");

const impliedFromOdds = o =>
  Number.isFinite(o)
    ? o > 0
      ? 100 / (o + 100)
      : Math.abs(o) / (Math.abs(o) + 100)
    : null;

/* =========================================================
   SIGNAL LOGIC
   ========================================================= */

function signalFromDistribution(ev, evs) {
  if (!Number.isFinite(ev) || evs.length < 2)
    return { cls: "signal-weak", txt: "MIN" };

  const sorted = [...evs].sort((a, b) => a - b);
  const rank = sorted.indexOf(ev) / (sorted.length - 1);

  if (rank >= 0.9) return { cls: "signal-very-strong", txt: "HIGH" };
  if (rank >= 0.7) return { cls: "signal-strong", txt: "MED" };
  if (rank >= 0.4) return { cls: "signal-moderate", txt: "LOW" };
  return { cls: "signal-weak", txt: "MIN" };
}

/* =========================================================
   SPORT-AWARE FETCH
   ========================================================= */

const SPORT = document.body?.dataset?.sport || "nfl";

async function fetchGames() {
  const url = SPORT === "nhl" ? "/api/events_nhl" : "/api/events";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Games API failed");
  return r.json();
}

/* =========================================================
   ML RENDERING
   ========================================================= */

function renderML(game) {
  const ml = game?.best?.ml;
  if (!ml || !ml.home || !ml.away) return "";

  const rows = [
    { ...ml.away, team: game.away_team },
    { ...ml.home, team: game.home_team }
  ].filter(o => Number.isFinite(o.odds) && Number.isFinite(o.consensus_prob));

  if (!rows.length) return "";

  const evs = rows.map(r => r.ev).filter(Number.isFinite);
  const maxProb = Math.max(...rows.map(r => impliedFromOdds(r.odds) || 0));
  const maxEv = evs.length ? Math.max(...evs) : null;

  return rows
    .map(o => {
      const sig = signalFromDistribution(o.ev, evs);
      const booksFavor = impliedFromOdds(o.odds) === maxProb;
      const bestValue = Number.isFinite(o.ev) && o.ev === maxEv && maxEv > 0;

      return `
        <div class="market-row">
          <span class="market-tag ml">ML</span>
          <div class="market-main">
            <div class="market-name">
              ${o.team}
              ${booksFavor ? `<span class="pill-mini pill-fav">BOOKS FAVOR</span>` : ""}
              ${bestValue ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
            </div>
            <div class="market-odds">${fmtOdds(o.odds)}</div>
            <div class="market-meta">
              Books ${pct(impliedFromOdds(o.odds))}
              · Consensus ${pct(o.consensus_prob)}
              · Value ${Number.isFinite(o.ev) ? (o.ev * 100).toFixed(1) + "%" : "—"}
            </div>
          </div>
          <div class="signal-bubble ${sig.cls}">${sig.txt}</div>
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   GAME NARRATIVE (SAFE)
   ========================================================= */

function gameNarrative(game) {
  const h = game?.best?.ml?.home;
  const a = game?.best?.ml?.away;
  if (!h || !a) return "";

  const lean =
    h.consensus_prob > a.consensus_prob
      ? game.home_team
      : game.away_team;

  return `
    <div class="muted" style="margin:8px 0;font-size:0.8rem">
      Market pricing leans toward <b>${lean}</b>.
    </div>
  `;
}

/* =========================================================
   GAME CARD (DEFENSIVE)
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

      <div class="props-container"></div>
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP (FAIL SAFE)
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");

  if (!container) {
    console.error("Missing #games-container");
    return;
  }

  try {
    const games = await fetchGames();
    if (!Array.isArray(games) || !games.length) {
      container.innerHTML = `<div class="muted">No games available.</div>`;
      return;
    }

    container.innerHTML = games.map(gameCard).join("");
  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="muted">Failed to load games.</div>`;
  }
});
