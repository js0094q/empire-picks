import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

async function fetchProps(eventId) {
  const r = await fetch(`/api/props?id=${eventId}`);
  if (!r.ok) throw new Error("Props fetch failed");
  return r.json();
}

async function fetchProps(eventId) {
  const r = await fetch(`/api/props?id=${eventId}`);
  if (!r.ok) throw new Error("Props fetch failed");
  return r.json();
}

const impliedProb = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const evClass = ev =>
  ev > 0.03 ? "ev-green" : ev < -0.03 ? "ev-red" : "ev-neutral";

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
   STATE
   ========================================================= */

const autoPickCandidates = [];
const gamesContainer = document.getElementById("games-container");

/* =========================================================
   PARLAY MODAL ENGINE
   ========================================================= */

const Parlay = {
  legs: [],
  add(leg) {
    if (!this.legs.find(l => l.label === leg.label)) {
      this.legs.push(leg);
    }

    // FORCE modal open every time (Safari-safe)
    modal.classList.remove("open");
    backdrop.classList.remove("open");

    requestAnimationFrame(() => {
      modal.classList.add("open");
      backdrop.classList.add("open");
    });

    renderParlay();
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

document.getElementById("close-parlay").onclick = closeParlay;
backdrop.onclick = closeParlay;

function americanToDecimal(o) {
  return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
}

function computeParlay() {
  let mult = 1;
  let prob = 1;

  Parlay.legs.forEach(l => {
    mult *= americanToDecimal(l.odds);
    prob *= l.prob;
  });

  return { mult, prob, ev: prob * mult - 1 };
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
      </div>
    `;
  });

  const p = computeParlay();

  sum.innerHTML = `
    <div>${stake.toFixed(2)} → ${(stake * p.mult).toFixed(2)}</div>
    <div>Prob ${pct(p.prob)}</div>
    <div class="${evClass(p.ev)}">EV ${pct(p.ev)}</div>
  `;
}

window.__removeLeg = i => Parlay.remove(i);
document.getElementById("parlay-stake").oninput = renderParlay;

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () =>
  (await fetch("/api/events")).json();

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
  autoPickCandidates.length = 0;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(gameCard(g)));
  renderTopPicks();
}

/* =========================================================
   GAME CARD
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
  const propsToggle = document.createElement("button");
  propsToggle.className = "props-toggle";
  propsToggle.textContent = "Show Props";

  const propsContainer = document.createElement("div");
  propsContainer.className = "props-container";

  let loaded = false;

  propsToggle.onclick = async () => {
    propsContainer.classList.toggle("open");

    if (loaded) return;
    loaded = true;

    propsContainer.innerHTML = `<div class="muted">Loading props…</div>`;

    try {
      const data = await fetchProps(game.id);
      renderProps(propsContainer, data.categories);
    } catch (e) {
      propsContainer.innerHTML =
        `<div class="muted">Props unavailable</div>`;
    }

  card.appendChild(propsToggle);
  card.appendChild(propsContainer);
  const row = document.createElement("div");
  row.className = "markets-row";

  ["h2h", "spreads", "totals"].forEach(m =>
    row.appendChild(marketBox(game, m))
  );

  card.appendChild(row);
  return card;
}
function renderProps(container, categories) {
  container.innerHTML = "";

  Object.entries(categories).forEach(([cat, props]) => {
    if (!props.length) return;

    const section = document.createElement("div");
    section.className = "prop-category";
    section.innerHTML = `<strong>${cat}</strong>`;

    props.slice(0, 4).forEach(p => {
      const best =
        p.over_ev > p.under_ev
          ? { side: "Over", ev: p.over_ev, prob: p.over_prob, odds: p.over_odds }
          : { side: "Under", ev: p.under_ev, prob: p.under_prob, odds: p.under_odds };

      const row = document.createElement("div");
      row.className = "prop-row";

      row.innerHTML = `
        <div>
          <div class="prop-player">${p.player}</div>
          <div class="prop-line">${best.side} ${p.point}</div>
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
      `;

      section.appendChild(row);
    });

    container.appendChild(section);
  });
}
/* =========================================================
   MARKETS
   ========================================================= */

function marketBox(game, key) {
  const box = document.createElement("div");
  box.className = "market-box";

  const best = {};
  game.books[key].forEach(r =>
    [r.outcome1, r.outcome2].forEach(o => {
      if (!best[o.name] || o.odds > best[o.name].odds) best[o.name] = o;
    })
  );

  Object.values(best).forEach(o => {
    const imp = impliedProb(o.odds);
    const d = o.fair - imp;

    if (o.edge > 0.03 && o.fair > 0.55) {
      autoPickCandidates.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: o.fair,
        ev: o.edge,
        score: o.fair * o.edge
      });
    }

    box.innerHTML += `
      <div class="market-row ${signalClass(d)}">
        <div>
          <strong>${o.name}</strong> ${fmtOdds(o.odds)}
          <div class="muted">
            Book ${pct(imp)} • Model ${pct(o.fair)}
          </div>
        </div>
        <div class="badge">${consensusLabel(o.fair)}</div>
        <button class="parlay-btn"
          data-label="${game.away_team} @ ${game.home_team} — ${o.name}"
          data-odds="${o.odds}"
          data-prob="${o.fair}">
          + Parlay
        </button>
      </div>
    `;
  });

  return box;
}

/* =========================================================
   TOP PICKS
   ========================================================= */

function renderTopPicks() {
  const box = document.getElementById("top-picks");

  const picks = [...autoPickCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  box.innerHTML = `
    <h3>Top Picks (Model-Weighted)</h3>
    ${picks.map(p => `
      <div class="top-pick">
        <strong>${p.label}</strong>
        <div class="muted">Prob ${pct(p.prob)} • EV ${pct(p.ev)}</div>
        <span class="badge">${consensusLabel(p.prob)}</span>
      </div>
    `).join("")}
  `;
}

/* =========================================================
   EVENTS
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
