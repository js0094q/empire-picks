/* =========================================================
   EmpirePicks — Final Homepage Script
   One Pick Per Game • Odds + Props Behind Toggles
   ========================================================= */

import { Teams } from "./teams.js";

/* =========================================================
   CONFIG (LOCKED)
   ========================================================= */

const MIN_PROB = 0.35;
const MAX_PROB = 0.75;
const MIN_STABILITY = 0.35;

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function kickoffLabel(utc) {
  return new Date(utc).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* =========================================================
   FETCHERS
   ========================================================= */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to load events");
  return await r.json();
}

async function fetchProps(gameId) {
  const r = await fetch(`/api/props?id=${gameId}`);
  if (!r.ok) throw new Error("Failed to load props");
  return await r.json();
}

/* =========================================================
   CORE RULE — ONE PICK PER GAME
   ========================================================= */

function selectBestPick(game) {
  const c = [];

  const push = (type, side, o) => {
    if (!o) return;
    if (o.ev == null) return;
    if (o.consensus_prob < MIN_PROB || o.consensus_prob > MAX_PROB) return;
    if (o.stability < MIN_STABILITY) return;

    c.push({ type, side, ...o });
  };

  push("ml", "home", game.best.ml?.home);
  push("ml", "away", game.best.ml?.away);
  push("spread", "home", game.best.spread?.home);
  push("spread", "away", game.best.spread?.away);
  push("total", "over", game.best.total?.over);
  push("total", "under", game.best.total?.under);

  if (!c.length) return null;

  c.sort((a, b) =>
    b.ev !== a.ev ? b.ev - a.ev : b.stability - a.stability
  );

  return c[0];
}

/* =========================================================
   LABELING
   ========================================================= */

function pickLabel(p) {
  if (p.type === "ml") return p.name;
  if (p.type === "spread") {
    const sign = p.point > 0 ? "+" : "";
    return `${p.name} ${sign}${p.point}`;
  }
  if (p.type === "total") {
    return `${p.side.toUpperCase()} ${p.point}`;
  }
  return "";
}

/* =========================================================
   RENDER — GAME CARD
   ========================================================= */

function renderGameCard(game) {
  const pick = selectBestPick(game);
  if (!pick) return null;

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away?.logo || ""}" />
        <span>@</span>
        <img src="${home?.logo || ""}" />
        <strong>${away.abbr.toUpperCase()} @ ${home.abbr.toUpperCase()}</strong>
      </div>
      <div class="kickoff">${kickoffLabel(game.commence_time)}</div>
    </div>

    <div class="pick-main">
      <div class="pick-label">${pickLabel(pick)}</div>
      <div class="pick-odds">${fmtOdds(pick.odds)}</div>
    </div>

    <div class="pick-meta">
      <span>Model ${pct(pick.consensus_prob)}</span>
      <span class="ev ${pick.ev > 0 ? "ev-green" : "ev-red"}">
        Edge ${(pick.ev * 100).toFixed(2)}%
      </span>
    </div>

    <div class="pick-actions">
      <button class="details-btn">View Odds</button>
      <button class="props-btn">View Props</button>
      <button class="parlay-btn">Add to Parlay</button>
    </div>

    <div class="details hidden"></div>
    <div class="props hidden"></div>
  `;

  /* ---------------- Odds Toggle ---------------- */

  const detailsBtn = card.querySelector(".details-btn");
  const detailsEl = card.querySelector(".details");

  detailsBtn.onclick = () => {
    detailsEl.classList.toggle("hidden");
    if (!detailsEl.dataset.loaded) {
      renderAllMarkets(game, detailsEl);
      detailsEl.dataset.loaded = "1";
    }
  };

  /* ---------------- Props Toggle ---------------- */

  const propsBtn = card.querySelector(".props-btn");
  const propsEl = card.querySelector(".props");

  propsBtn.onclick = async () => {
    propsEl.classList.toggle("hidden");
    if (propsEl.dataset.loaded) return;

    propsEl.innerHTML = `<div class="muted">Loading props…</div>`;

    try {
      const data = await fetchProps(game.id);
      propsEl.innerHTML = renderProps(data.categories);
      propsEl.dataset.loaded = "1";
    } catch {
      propsEl.innerHTML = `<div class="muted">Props unavailable</div>`;
    }
  };

  return card;
}

/* =========================================================
   RENDER — FULL ODDS (SECONDARY)
   ========================================================= */

function renderAllMarkets(game, el) {
  el.innerHTML = `
    <div class="markets">
      ${renderMarket("Moneyline", game.books.h2h)}
      ${renderMarket("Spread", game.books.spreads)}
      ${renderMarket("Total", game.books.totals)}
    </div>
  `;
}

function renderMarket(title, rows) {
  if (!rows || !rows.length) return "";

  return `
    <div class="market-block">
      <h4>${title}</h4>
      ${rows.map(r => `
        <div class="market-row">
          <span>${r.outcome1.name}${r.outcome1.point != null ? " " + r.outcome1.point : ""}</span>
          <span>${fmtOdds(r.outcome1.odds)}</span>
          <span>${pct(r.outcome1.fair)}</span>
        </div>
        <div class="market-row">
          <span>${r.outcome2.name}${r.outcome2.point != null ? " " + r.outcome2.point : ""}</span>
          <span>${fmtOdds(r.outcome2.odds)}</span>
          <span>${pct(r.outcome2.fair)}</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* =========================================================
   RENDER — PROPS (TOP EV ONLY)
   ========================================================= */

function renderProps(categories) {
  return Object.entries(categories)
    .map(([cat, props]) => {
      if (!props.length) return "";

      const top = props.slice(0, 3);

      return `
        <div class="props-category">
          <h4>${cat}</h4>
          ${top.map(p => {
            const best =
              p.over_ev > p.under_ev
                ? { side: "Over", ev: p.over_ev, odds: p.over_odds }
                : { side: "Under", ev: p.under_ev, odds: p.under_odds };

            return `
              <div class="prop-row">
                <span>${p.player} ${best.side} ${p.point}</span>
                <span>${fmtOdds(best.odds)}</span>
                <span class="ev ${best.ev > 0 ? "ev-green" : "ev-red"}">
                  ${(best.ev * 100).toFixed(2)}%
                </span>
              </div>
            `;
          }).join("")}
        </div>
      `;
    })
    .join("");
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  container.innerHTML = "";

  try {
    const games = await fetchGames();

    games.forEach(g => {
      const card = renderGameCard(g);
      if (card) container.appendChild(card);
    });

    if (!container.children.length) {
      container.innerHTML = `<div class="muted">No qualified edges today.</div>`;
    }
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="muted">Failed to load games.</div>`;
  }
});
