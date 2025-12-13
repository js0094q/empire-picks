import { Teams } from "./teams.js";

/* ============================================================
   HELPERS
   ============================================================ */

const pct = x => (x * 100).toFixed(1) + "%";

function fmtOdds(o) {
  if (o == null) return "-";
  return o > 0 ? `+${o}` : `${o}`;
}

function evClass(e) {
  if (e == null || isNaN(e)) return "ev-neutral";
  if (e > 0.03) return "ev-green";
  if (e < -0.03) return "ev-red";
  return "ev-neutral";
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

/* ============================================================
   PARLAY ENGINE
   ============================================================ */

window.Parlay = {
  legs: [],
  addLeg(leg) {
    if (!this.legs.some(l => l.label === leg.label)) {
      this.legs.push(leg);
    }
    renderParlay();
  },
  removeLeg(i) {
    this.legs.splice(i, 1);
    renderParlay();
  }
};

function americanToDecimal(o) {
  return o > 0 ? (o / 100 + 1) : (100 / Math.abs(o) + 1);
}

function computeParlay() {
  if (!window.Parlay.legs.length) return { mult: 0, prob: 0, ev: 0 };

  let mult = 1;
  let prob = 1;

  window.Parlay.legs.forEach(l => {
    mult *= americanToDecimal(l.odds);
    prob *= l.prob ?? 0.5;
  });

  return { mult, prob, ev: (prob * mult) - 1 };
}

/* ============================================================
   FETCH
   ============================================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Events failed");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  if (!r.ok) throw new Error("Props failed");
  return r.json();
}

/* ============================================================
   INIT
   ============================================================ */

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = loadGames;

loadGames();

/* ============================================================
   LOAD EVENTS
   ============================================================ */

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading games…</div>`;
  try {
    const games = await fetchGames();
    container.innerHTML = "";
    games.forEach(g => container.appendChild(createGameCard(g)));
  } catch {
    container.innerHTML = `<div class="error">Failed loading games</div>`;
  }
}

/* ============================================================
   GAME CARD
   ============================================================ */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" class="team-logo">
        ${game.away_team}
        <span class="muted">@</span>
        <img src="${home.logo}" class="team-logo">
        ${game.home_team}
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  card.appendChild(buildMarket("Moneyline", game.books.h2h, game));
  card.appendChild(buildMarket("Spread", game.books.spreads, game));
  card.appendChild(buildMarket("Total", game.books.totals, game));
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   AGGREGATED MARKET (BEST PRICE ONLY)
   ============================================================ */

function buildMarket(title, rows = [], game) {
  if (!rows.length) return document.createElement("div");

  const box = document.createElement("div");
  box.className = "market-box";
  box.innerHTML = `<div class="market-title">${title}</div>`;

  const outcomes = {};

  rows.forEach(r => {
    [r.outcome1, r.outcome2].forEach(o => {
      if (!outcomes[o.name] || o.odds > outcomes[o.name].odds) {
        outcomes[o.name] = o;
      }
    });
  });

  Object.values(outcomes).forEach(o => {
    const row = document.createElement("div");
    row.className = "market-row";

    row.innerHTML = `
      <div>${o.name}: ${fmtOdds(o.odds)}</div>
      <div class="${evClass(o.edge)}">EV ${pct(o.edge)}</div>
      <button class="parlay-btn">+ Parlay</button>
    `;

    row.querySelector("button").onclick = () =>
      window.Parlay.addLeg({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: o.fair
      });

    box.appendChild(row);
  });

  return box;
}

/* ============================================================
   PLAYER PROPS (FIXED)
   ============================================================ */

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";

  const header = document.createElement("div");
  header.className = "accordion-title";
  header.textContent = "Player Props";

  const panel = document.createElement("div");
  panel.className = "panel";

  header.onclick = async e => {
    e.stopPropagation();

    if (panel.classList.contains("open")) {
      panel.classList.remove("open");
      panel.style.maxHeight = null;
      return;
    }

    panel.classList.add("open");
    panel.innerHTML = `<div class="loading">Loading props…</div>`;

    try {
      const data = await fetchProps(game.id);
      if (!data.categories || !Object.keys(data.categories).length) {
        panel.innerHTML = `<div class="muted">Props not posted yet</div>`;
      } else {
        panel.innerHTML = buildPropsUI(data.categories);
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    } catch {
      panel.innerHTML = `<div class="error">Unable to load props</div>`;
    }
  };

  acc.appendChild(header);
  acc.appendChild(panel);
  return acc;
}

/* ============================================================
   PROPS UI
   ============================================================ */

function buildPropsUI(categories) {
  let html = "";

  Object.entries(categories).forEach(([cat, props]) => {
    html += `<h4>${cat}</h4>`;
    props.forEach(p => {
      html += `
        <div class="prop-item">
          <div><strong>${p.player}</strong></div>
          <div>${p.label} ${p.point}</div>

          <div>
            Over ${fmtOdds(p.over_odds)}
            <span class="${evClass(p.over_ev)}">EV ${pct(p.over_ev)}</span>
            <button class="parlay-btn"
              onclick='window.Parlay.addLeg({
                label: "${p.player} Over ${p.point}",
                odds: ${p.over_odds},
                prob: ${p.over_prob}
              })'>+ Parlay</button>
          </div>

          <div>
            Under ${fmtOdds(p.under_odds)}
            <span class="${evClass(p.under_ev)}">EV ${pct(p.under_ev)}</span>
            <button class="parlay-btn"
              onclick='window.Parlay.addLeg({
                label: "${p.player} Under ${p.point}",
                odds: ${p.under_odds},
                prob: ${p.under_prob}
              })'>+ Parlay</button>
          </div>
        </div>
      `;
    });
  });

  return html;
}

/* ============================================================
   PARLAY SIDEBAR (BASIC)
   ============================================================ */

function renderParlay() {
  const box = document.getElementById("parlay-legs");
  const sum = document.getElementById("parlay-summary");
  if (!box || !sum) return;

  box.innerHTML = "";
  window.Parlay.legs.forEach((l, i) => {
    box.innerHTML += `
      <div class="parlay-leg">
        ${l.label} (${fmtOdds(l.odds)})
        <span onclick="window.Parlay.removeLeg(${i})">✖</span>
      </div>
    `;
  });

  const p = computeParlay();
  sum.innerHTML = `
    <div>Payout: ${p.mult.toFixed(2)}x</div>
    <div>Prob: ${pct(p.prob)}</div>
    <div class="${evClass(p.ev)}">EV ${pct(p.ev)}</div>
  `;
}
