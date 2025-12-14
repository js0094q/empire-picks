import { Teams } from "./teams.js";

/* =========================================================
   SAFETY GUARD (prevents double load forever)
   ========================================================= */
if (window.__EMPIREPICKS__) {
  throw new Error("EmpirePicks script loaded twice");
}
window.__EMPIREPICKS__ = true;

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

const impliedProb = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const evClass = ev =>
  ev > 0.05 ? "ev-green" :
  ev < -0.05 ? "ev-red" : "ev-neutral";

const strength = p =>
  p > 0.75 ? { label: "Very Strong", level: 4 } :
  p > 0.65 ? { label: "Strong", level: 3 } :
  p > 0.55 ? { label: "Moderate", level: 2 } :
             { label: "Weak", level: 1 };

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
   PARLAY ENGINE (unchanged)
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
        <span onclick="window.__rm(${i})">✕</span>
      </div>
    `;
  });

  let mult = 1, prob = 1;
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

window.__rm = i => Parlay.remove(i);
document.getElementById("parlay-stake").oninput = renderParlay;

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () =>
  (await fetch("/api/events")).json();

const fetchProps = async id =>
  (await fetch(`/api/props?id=${id}`)).json();

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

  const row = document.createElement("div");
  row.className = "markets-row";

  ["h2h", "spreads", "totals"].forEach(m =>
    row.appendChild(marketBox(game, m))
  );

  card.appendChild(row);

  /* ================= PROPS ================= */

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
    try {
      const data = await fetchProps(game.id);
      renderProps(propsWrap, data.categories);
    } catch {
      propsWrap.innerHTML = `<div class="muted">Props unavailable</div>`;
    }
  };

  card.appendChild(propsBtn);
  card.appendChild(propsWrap);

  return card;
}

/* =========================================================
   MARKET BOX (ODDS + STRENGTH VISUAL)
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
    const s = strength(o.fair);

    box.innerHTML += `
      <div class="market-row">
        <div>
          <strong>${o.name}</strong> ${fmtOdds(o.odds)}
          <div class="muted">Book ${pct(imp)} • Model ${pct(o.fair)}</div>
        </div>

        <div class="strength">
          ${[1,2,3,4].map(i =>
            `<span class="dot ${i <= s.level ? "on" : ""}"></span>`
          ).join("")}
          <div class="badge">${s.label}</div>
        </div>

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
   PROPS RENDER
   ========================================================= */

function renderProps(container, categories) {
  container.innerHTML = "";

  Object.entries(categories).forEach(([cat, props]) => {
    if (!props.length) return;

    const sec = document.createElement("div");
    sec.className = "prop-category";
    sec.innerHTML = `<strong>${cat}</strong>`;

    props.slice(0, 4).forEach(p => {
      const best =
        p.over_ev > p.under_ev
          ? { side: "Over", odds: p.over_odds, prob: p.over_prob, ev: p.over_ev }
          : { side: "Under", odds: p.under_odds, prob: p.under_prob, ev: p.under_ev };

      const s = strength(best.prob);

      sec.innerHTML += `
        <div class="prop-row">
          <div>
            <div>${p.player}</div>
            <div class="muted">${best.side} ${p.point} ${fmtOdds(best.odds)}</div>
          </div>

          <div class="strength">
            ${[1,2,3,4].map(i =>
              `<span class="dot ${i <= s.level ? "on" : ""}"></span>`
            ).join("")}
          </div>

          <button class="parlay-btn"
            data-label="${p.player} ${best.side} ${p.point}"
            data-odds="${best.odds}"
            data-prob="${best.prob}">
            + Parlay
          </button>
        </div>
      `;
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
