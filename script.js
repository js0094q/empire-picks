import { Teams } from "./teams.js";

/* =========================================================
   HARD GUARD — PREVENT DOUBLE LOAD (FOREVER)
   ========================================================= */
if (window.__EMPIREPICKS_LOADED__) {
  throw new Error("EmpirePicks script loaded twice");
}
window.__EMPIREPICKS_LOADED__ = true;

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

const impliedProb = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const evClass = ev =>
  ev > 0.04 ? "ev-green" : ev < -0.04 ? "ev-red" : "ev-neutral";

const signalClass = d =>
  d > 0.15 ? "signal-strong" :
  d > 0.08 ? "signal-medium" :
  d > 0.04 ? "signal-light" : "";

const consensusLabel = p =>
  p > 0.75 ? "Very Strong" :
  p > 0.65 ? "Strong" :
  p > 0.55 ? "Moderate" : "Weak";

const kickoffLocal = utc =>
  new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

/* =========================================================
   DOM
   ========================================================= */

const gamesContainer = document.getElementById("games-container");
const topPicksBox = document.getElementById("top-picks");

/* =========================================================
   PARLAY ENGINE (UNCHANGED)
   ========================================================= */

const Parlay = {
  legs: [],
  add(leg) {
    if (!this.legs.find(l => l.label === leg.label)) {
      this.legs.push(leg);
    }
    renderParlay();
    openParlay();
  },
  remove(i) {
    this.legs.splice(i, 1);
    renderParlay();
  }
};

const modal = document.getElementById("parlay-modal");
const backdrop = document.getElementById("parlay-backdrop");

function openParlay() {
  modal.classList.add("open");
  backdrop.classList.add("open");
}
function closeParlay() {
  modal.classList.remove("open");
  backdrop.classList.remove("open");
}
backdrop.onclick = closeParlay;
document.getElementById("close-parlay").onclick = closeParlay;

function americanToDecimal(o) {
  return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
}

function renderParlay() {
  const legsEl = document.getElementById("parlay-legs");
  const sum = document.getElementById("parlay-summary");
  const stake = Number(document.getElementById("parlay-stake").value || 0);

  legsEl.innerHTML = "";

  Parlay.legs.forEach((l, i) => {
    legsEl.innerHTML += `
      <div class="parlay-leg">
        ${l.label} (${fmtOdds(l.odds)})
        <span onclick="window.__removeLeg(${i})">✕</span>
      </div>`;
  });

  let mult = 1;
  let prob = 1;
  Parlay.legs.forEach(l => {
    mult *= americanToDecimal(l.odds);
    prob *= l.prob;
  });

  sum.innerHTML = `
    <div>${stake.toFixed(2)} → ${(stake * mult).toFixed(2)}</div>
    <div>Prob ${pct(prob)}</div>
    <div class="${evClass(prob * mult - 1)}">EV ${pct(prob * mult - 1)}</div>
  `;
}

window.__removeLeg = i => Parlay.remove(i);
document.getElementById("parlay-stake").oninput = renderParlay;

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () => (await fetch("/api/events")).json();
const fetchProps = async id => (await fetch(`/api/props?id=${id}`)).json();

/* =========================================================
   INIT
   ========================================================= */

document.getElementById("refresh-btn").onclick = loadGames;
loadGames();

/* =========================================================
   LOAD GAMES
   ========================================================= */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  topPicksBox.innerHTML = `<h3>Top Picks (Model-Weighted)</h3>`;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(gameCard(g)));
}

/* =========================================================
   GAME CARD — FULLY RESTORED ODDS
   ========================================================= */

function gameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}">
        <span>@</span>
        <img src="${home.logo}">
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  const row = document.createElement("div");
  row.className = "markets-row";

  row.appendChild(marketBox(game, "ml"));
  row.appendChild(marketBox(game, "spread"));
  row.appendChild(marketBox(game, "total"));

  card.appendChild(row);

  /* ================= PROPS (ADDED, NON-DESTRUCTIVE) ================= */

  const propsBtn = document.createElement("button");
  propsBtn.className = "props-toggle";
  propsBtn.textContent = "Show Props";

  const propsWrap = document.createElement("div");
  propsWrap.className = "props-container";

  let loaded = false;

  propsBtn.onclick = async () => {
    propsWrap.classList.toggle("open");
    if (loaded) return;
    loaded = true;
    propsWrap.innerHTML = `<div class="muted">Loading props…</div>`;
    const data = await fetchProps(game.id);
    renderProps(propsWrap, data.categories);
  };

  card.appendChild(propsBtn);
  card.appendChild(propsWrap);

  return card;
}

/* =========================================================
   MARKET BOX (ML / SPREAD / TOTAL)
   ========================================================= */

function marketBox(game, key) {
  const box = document.createElement("div");
  box.className = "market-box";

  const sides = Object.values(game.best[key]);

  sides.forEach(o => {
    const imp = impliedProb(o.odds);
    const d = o.consensus_prob - imp;

    box.innerHTML += `
      <div class="market-row ${signalClass(d)}">
        <div>
          <strong>${o.name ?? key}</strong> ${fmtOdds(o.odds)}
          <div class="muted">
            Book ${pct(imp)} • Model ${pct(o.consensus_prob)}
          </div>
        </div>
        <div class="badge">${consensusLabel(o.consensus_prob)}</div>
        <button class="parlay-btn"
          data-label="${game.away_team} @ ${game.home_team} — ${o.name ?? key}"
          data-odds="${o.odds}"
          data-prob="${o.consensus_prob}">
          + Parlay
        </button>
      </div>`;
  });

  return box;
}

/* =========================================================
   PROPS RENDER (SAFE ADDITION)
   ========================================================= */

function renderProps(container, categories) {
  container.innerHTML = "";

  Object.entries(categories).forEach(([cat, props]) => {
    const sec = document.createElement("div");
    sec.className = "prop-category";
    sec.innerHTML = `<strong>${cat}</strong>`;

    props.slice(0, 4).forEach(p => {
      const best =
        p.over_ev > p.under_ev
          ? { side: "Over", ev: p.over_ev, prob: p.over_prob, odds: p.over_odds }
          : { side: "Under", ev: p.under_ev, prob: p.under_prob, odds: p.under_odds };

      sec.innerHTML += `
        <div class="prop-row">
          <div>
            <div class="prop-player">${p.player}</div>
            <div class="prop-line">${best.side} ${p.point} ${fmtOdds(best.odds)}</div>
          </div>
          <div class="prop-ev ${evClass(best.ev)}">
            EV ${pct(best.ev)}
          </div>
          <button class="parlay-btn"
            data-label="${p.player} ${best.side} ${p.point}"
            data-odds="${best.odds}"
            data-prob="${best.prob}">
            + Parlay
          </button>
        </div>`;
    });

    container.appendChild(sec);
  });
}

/* =========================================================
   GLOBAL PARLAY CLICK
   ========================================================= */

document.addEventListener("click", e => {
  const btn = e.target.closest(".parlay-btn");
  if (!btn) return;

  Parlay.add({
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  });
});
