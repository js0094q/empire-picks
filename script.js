import { Teams } from "./teams.js";

/* =====================================================
   CONFIG
   ===================================================== */

// Sharp books get higher weight in consensus
const BOOK_WEIGHTS = {
  pinnacle: 1.4,
  circa: 1.35,
  bookmaker: 1.25,
  draftkings: 1.15,
  fanduel: 1.15,
  betmgm: 1.1,
  caesars: 1.1,
  barstool: 1.0,
  pointsbet: 1.0,
  default: 0.9
};

// EV thresholds
const EV_MIN = 0.03;
const PROB_MIN = 0.55;

/* =====================================================
   HELPERS
   ===================================================== */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

const impliedProb = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

function strengthLabel(delta) {
  if (delta > 0.15) return "Very Strong";
  if (delta > 0.08) return "Strong";
  if (delta > 0.04) return "Moderate";
  return "Weak";
}

function strengthClass(delta) {
  if (delta > 0.15) return "badge-very-strong";
  if (delta > 0.08) return "badge-strong";
  if (delta > 0.04) return "badge-moderate";
  return "badge-weak";
}

function kickoffLocal(utc) {
  return new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });
}

/* =====================================================
   CONSENSUS ENGINE
   ===================================================== */

function weightedAverage(outcomes) {
  let totalWeight = 0;
  let sum = 0;

  outcomes.forEach(o => {
    const w = BOOK_WEIGHTS[o.book] ?? BOOK_WEIGHTS.default;
    sum += o.prob * w;
    totalWeight += w;
  });

  return totalWeight ? sum / totalWeight : null;
}

/* =====================================================
   GLOBAL STATE
   ===================================================== */

const autoPickCandidates = [];

const Parlay = {
  legs: []
};

/* =====================================================
   FETCH
   ===================================================== */

async function fetchGames() {
  const r = await fetch("/api/events");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  return r.json();
}

/* =====================================================
   INIT
   ===================================================== */

const gamesContainer = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = loadGames;

loadGames();

/* =====================================================
   LOAD GAMES
   ===================================================== */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  autoPickCandidates.length = 0;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(createGameCard(g)));
  renderTopPicks();
}

/* =====================================================
   GAME CARD
   ===================================================== */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}">
        ${game.away_team}
        <span>@</span>
        <img src="${home.logo}">
        ${game.home_team}
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  const markets = document.createElement("div");
  markets.className = "markets-row";

  markets.appendChild(buildMarket("Moneyline", game.books.h2h, game));
  markets.appendChild(buildMarket("Spread", game.books.spreads, game));
  markets.appendChild(buildMarket("Total", game.books.totals, game));

  card.appendChild(markets);

  const propsWrap = document.createElement("div");
  propsWrap.className = "props-wrap";
  card.appendChild(propsWrap);

  fetchProps(game.id).then(p => {
    if (p?.categories) {
      propsWrap.innerHTML = `
        <h4 class="props-title">Player Props</h4>
        ${buildPropsUI(p.categories)}
      `;
    }
  });

  return card;
}

/* =====================================================
   MAIN MARKETS
   ===================================================== */

function buildMarket(title, rows, game) {
  const box = document.createElement("div");
  box.className = "market-box";
  box.innerHTML = `<div class="market-title">${title}</div>`;

  rows.forEach(o => {
    const imp = impliedProb(o.odds);
    const delta = o.fair - imp;

    const badge = strengthLabel(delta);
    const cls = strengthClass(delta);

    if (delta > EV_MIN && o.fair > PROB_MIN) {
      autoPickCandidates.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        prob: o.fair,
        ev: delta,
        score: delta * o.fair
      });
    }

    box.innerHTML += `
      <div class="market-row">
        <div>
          <strong>${o.name}</strong> ${fmtOdds(o.odds)}
          <div class="muted">
            Book ${pct(imp)} • Model ${pct(o.fair)}
          </div>
        </div>
        <span class="strength-badge ${cls}">${badge}</span>
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

/* =====================================================
   PROPS (FILTERED + RANKED)
   ===================================================== */

function buildPropsUI(categories) {
  let html = "";

  Object.entries(categories).forEach(([cat, props]) => {
    const valid = props
      .filter(p =>
        p.over_odds && p.over_prob > 0.05 &&
        p.under_odds && p.under_prob > 0.05
      )
      .sort((a, b) =>
        Math.max(b.over_ev, b.under_ev) -
        Math.max(a.over_ev, a.under_ev)
      )
      .slice(0, 6);

    if (!valid.length) return;

    html += `<h5>${cat}</h5>`;

    valid.forEach(p => {
      html += `
        <div class="prop-item">
          <strong>${p.player}</strong>
          <div class="muted">${p.label} ${p.point}</div>

          ${renderPropSide("Over", p.over_odds, p.over_prob, p.over_ev, p)}
          ${renderPropSide("Under", p.under_odds, p.under_prob, p.under_ev, p)}
        </div>
      `;
    });
  });

  return html || `<div class="muted">No playable props.</div>`;
}

function renderPropSide(side, odds, prob, ev, p) {
  const badge = strengthLabel(ev);
  const cls = strengthClass(ev);

  return `
    <div class="prop-side">
      ${side} ${fmtOdds(odds)}
      <div class="muted">Model ${pct(prob)}</div>
      <span class="strength-badge ${cls}">${badge}</span>
      <button class="parlay-btn"
        data-label="${p.player} ${side} ${p.point}"
        data-odds="${odds}"
        data-prob="${prob}">
        + Parlay
      </button>
    </div>
  `;
}

/* =====================================================
   PARLAY MODAL (BULLETPROOF)
   ===================================================== */

const modal = document.getElementById("parlay-modal");
const backdrop = document.getElementById("parlay-backdrop");

document.getElementById("close-parlay").onclick = closeParlay;
backdrop.onclick = closeParlay;

function openParlay() {
  modal.classList.add("open");
  backdrop.classList.add("open");
}

function closeParlay() {
  modal.classList.remove("open");
  backdrop.classList.remove("open");
}

/* =====================================================
   EVENTS
   ===================================================== */

document.addEventListener("click", e => {
  const btn = e.target.closest(".parlay-btn");
  if (!btn) return;

  const leg = {
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  };

  if (!Parlay.legs.find(l => l.label === leg.label)) {
    Parlay.legs.push(leg);
  }

  renderParlay();
  openParlay();
});

/* =====================================================
   PARLAY RENDER
   ===================================================== */

function renderParlay() {
  const legs = document.getElementById("parlay-legs");
  const sum = document.getElementById("parlay-summary");
  const stake = Number(document.getElementById("parlay-stake").value || 0);

  legs.innerHTML = Parlay.legs
    .map(l => `<div>${l.label} (${fmtOdds(l.odds)})</div>`)
    .join("");

  let mult = 1;
  let prob = 1;

  Parlay.legs.forEach(l => {
    mult *= l.odds > 0 ? l.odds / 100 + 1 : 100 / Math.abs(l.odds) + 1;
    prob *= l.prob;
  });

  sum.innerHTML = `
    <div>${stake.toFixed(2)} to win ${(stake * mult).toFixed(2)}</div>
    <div>Prob ${pct(prob)}</div>
  `;
}

/* =====================================================
   TOP PICKS
   ===================================================== */

function renderTopPicks() {
  const box = document.getElementById("top-picks");
  if (!box) return;

  const picks = [...autoPickCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  box.innerHTML = `
    <h3>Top Picks (Model-Weighted)</h3>
    ${picks.map(p => `
      <div class="top-pick">
        <strong>${p.label}</strong>
        <div class="muted">Prob ${pct(p.prob)} • EV ${pct(p.ev)}</div>
        <span class="strength-badge badge-strong">Strong</span>
      </div>
    `).join("")}
  `;
}
