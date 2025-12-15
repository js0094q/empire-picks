import { Teams } from "./teams.js";

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);
const impliedProb = o => (o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100));

const evClass = ev =>
  ev > 0.05 ? "ev-green" : ev < -0.05 ? "ev-red" : "ev-neutral";

const signalClass = d =>
  d > 0.15 ? "signal-strong" :
  d > 0.08 ? "signal-medium" :
  d > 0.04 ? "signal-light" : "";

const consensusLabel = p =>
  p > 0.75 ? "🔥 Elite" :
  p > 0.65 ? "Strong" :
  p > 0.55 ? "Solid" : "Weak";

const kickoffLocal = utc =>
  new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

/* =========================================================
   PARLAY STATE
   ========================================================= */

const Parlay = {
  legs: [],
  add(leg) {
    if (!this.legs.find(l => l.label === leg.label)) {
      this.legs.push(leg);
      updateProfileStats();
    }
    renderParlay();
  },
  remove(i) {
    this.legs.splice(i, 1);
    renderParlay();
  }
};

let legsEl, sumEl, stakeEl;

function americanToDecimal(o) {
  return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
}

function computeParlay() {
  let mult = 1, prob = 1;
  Parlay.legs.forEach(l => {
    mult *= americanToDecimal(l.odds);
    prob *= l.prob;
  });
  return { mult, prob, ev: prob * mult - 1 };
}

function renderParlay() {
  if (!legsEl || !sumEl) return;
  legsEl.innerHTML = "";

  Parlay.legs.forEach((l, i) => {
    legsEl.innerHTML += `
      <div class="parlay-leg">
        ${l.label} (${fmtOdds(l.odds)})
        <span class="remove-leg" data-index="${i}">✕</span>
      </div>
    `;
  });

  const stake = Number(stakeEl?.value || 0);
  const p = computeParlay();
  sumEl.innerHTML = `
    <div>${stake.toFixed(2)} → ${(stake * p.mult).toFixed(2)}</div>
    <div>Prob ${pct(p.prob)}</div>
    <div class="${evClass(p.ev)}">EV ${pct(p.ev)}</div>
  `;
}

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () => (await fetch("/api/events")).json();
const fetchProps = async id => (await fetch(`/api/props?id=${id}`)).json();

/* =========================================================
   UI + RENDERING
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
    const smart = d > 0.08;

    box.innerHTML += `
      <div class="market-row ${signalClass(d)}">
        <div>
          <strong>${o.name}</strong> ${fmtOdds(o.odds)}
          <div class="muted">Book ${pct(imp)} • Model ${pct(o.fair)}</div>
        </div>
        <div class="badge">${smart ? "🧠 Smart Pick" : consensusLabel(o.fair)}</div>
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

function renderProps(container, categories, game) {
  container.innerHTML = "";

  Object.entries(categories).forEach(([cat, props]) => {
    if (!props.length) return;

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
            <div class="prop-line">${best.side} ${p.point}</div>
          </div>
          <div class="prop-ev ${evClass(best.ev)}">EV ${pct(best.ev)}</div>
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

function gameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" alt="${away.abbr}">
        <span>@</span>
        <img src="${home.logo}" alt="${home.abbr}">
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  const toggle = document.createElement("button");
  toggle.className = "props-toggle";
  toggle.textContent = "Show Props";

  const propsBox = document.createElement("div");
  propsBox.className = "props-container";

  let loaded = false;
  toggle.onclick = async () => {
    propsBox.classList.toggle("open");
    if (!loaded) {
      loaded = true;
      propsBox.innerHTML = `<div class="muted">Loading props…</div>`;
      const data = await fetchProps(game.id);
      renderProps(propsBox, data.categories, game);
    }
  };

  card.appendChild(toggle);
  card.appendChild(propsBox);

  const row = document.createElement("div");
  row.className = "markets-row";
  ["h2h", "spreads", "totals"].forEach(m =>
    row.appendChild(marketBox(game, m))
  );

  card.appendChild(row);
  return card;
}

function updateProfileStats() {
  const bar = document.getElementById("profile-bar");
  const picks = Parlay.legs.length;
  const streak = Math.floor(Math.random() * 5); // Replace with real streak logic
  const level = Math.min(1 + Math.floor(picks / 10), 5);
  bar.innerHTML = `⚔️ Sharp Level ${level} • 🔥 Win Streak: ${streak} • Picks Analyzed: ${picks}`;
}

/* =========================================================
   INIT
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const gamesContainer = document.getElementById("games-container");

  // Load + Render Games
  const games = await fetchGames();
  gamesContainer.innerHTML = "";
  games.forEach(g => gamesContainer.appendChild(gameCard(g)));

  // Parlay Setup
  legsEl = document.createElement("div");
  stakeEl = document.createElement("input");
  sumEl = document.createElement("div");
  stakeEl.placeholder = "Stake";
  stakeEl.type = "number";
  stakeEl.min = 1;
  stakeEl.addEventListener("input", renderParlay);

  const parlayDiv = document.createElement("div");
  parlayDiv.style.marginTop = "20px";
  parlayDiv.appendChild(stakeEl);
  parlayDiv.appendChild(legsEl);
  parlayDiv.appendChild(sumEl);
  document.body.appendChild(parlayDiv);

  document.addEventListener("click", e => {
    const btn = e.target.closest(".parlay-btn");
    if (!btn) return;
    Parlay.add({
      label: btn.dataset.label,
      odds: Number(btn.dataset.odds),
      prob: Number(btn.dataset.prob)
    });
  });

  document.addEventListener("click", e => {
    const x = e.target.closest(".remove-leg");
    if (x) Parlay.remove(Number(x.dataset.index));
  });
});
