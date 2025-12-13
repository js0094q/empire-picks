import { Teams } from "./teams.js";

/* =======================
   HELPERS
   ======================= */

const pct = x => (x * 100).toFixed(1) + "%";

const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function impliedProbFromOdds(o) {
  return o > 0
    ? 100 / (o + 100)
    : Math.abs(o) / (Math.abs(o) + 100);
}

function evClass(e) {
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

/* =======================
   PARLAY ENGINE
   ======================= */

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
  return o > 0 ? o / 100 + 1 : 100 / Math.abs(o) + 1;
}

function computeParlay() {
  let mult = 1;
  let prob = 1;
  window.Parlay.legs.forEach(l => {
    mult *= americanToDecimal(l.odds);
    prob *= l.prob;
  });
  return { mult, prob, ev: prob * mult - 1 };
}

/* =======================
   FETCH
   ======================= */

async function fetchGames() {
  const r = await fetch("/api/events");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  return r.json();
}

/* =======================
   INIT
   ======================= */

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = loadGames;
loadGames();

/* =======================
   LOAD GAMES
   ======================= */

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading…</div>`;
  const games = await fetchGames();
  container.innerHTML = "";
  games.forEach(g => container.appendChild(createGameCard(g)));
}

/* =======================
   GAME CARD
   ======================= */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}">${game.away_team}
        <span>@</span>
        <img src="${home.logo}">${game.home_team}
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
  card.appendChild(buildPropsAccordion(game));
  return card;
}

/* =======================
   MAIN MARKETS
   ======================= */

function buildMarket(title, rows, game) {
  const box = document.createElement("div");
  box.className = "market-box";
  box.innerHTML = `<div class="market-title">${title}</div>`;

  const best = {};
  rows.forEach(r =>
    [r.outcome1, r.outcome2].forEach(o => {
      if (!best[o.name] || o.odds > best[o.name].odds) best[o.name] = o;
    })
  );

  Object.values(best).forEach(o => {
    const implied = impliedProbFromOdds(o.odds);
    const delta = o.fair - implied;

    const strength =
      delta > 0.15 ? "signal-strong" :
      delta > 0.08 ? "signal-medium" :
      delta > 0.04 ? "signal-light" :
      "signal-neutral";

    const row = document.createElement("div");
    row.className = `market-row ${strength}`;
    row.innerHTML = `
      <div>
        <strong>${o.name}</strong> ${fmtOdds(o.odds)}
        <div class="muted">Book: ${pct(implied)} • Model: ${pct(o.fair)}</div>
      </div>
      <div class="${evClass(o.edge)}">EV ${pct(o.edge)}</div>
      <button class="parlay-btn"
        data-label="${game.away_team} @ ${game.home_team} — ${o.name}"
        data-odds="${o.odds}"
        data-prob="${o.fair}">
        + Parlay
      </button>
    `;
    box.appendChild(row);
  });

  return box;
}

/* =======================
   PROPS
   ======================= */

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";

  const title = document.createElement("div");
  title.className = "accordion-title";
  title.textContent = "Player Props";

  const panel = document.createElement("div");
  panel.className = "panel";

  title.onclick = async () => {
    if (panel.classList.toggle("open")) {
      const data = await fetchProps(game.id);
      panel.innerHTML = buildPropsUI(data.categories);
    }
  };

  acc.appendChild(title);
  acc.appendChild(panel);
  return acc;
}

function buildPropsUI(categories) {
  let html = "";
  Object.entries(categories).forEach(([cat, props]) => {
    html += `<h4>${cat}</h4>`;
    props.forEach(p => {
      const impO = impliedProbFromOdds(p.over_odds);
      const impU = impliedProbFromOdds(p.under_odds);

      html += `
        <div class="prop-item">
          <strong>${p.player}</strong>
          <div>${p.label} ${p.point}</div>

          <div class="prop-side signal-medium">
            Over ${fmtOdds(p.over_odds)}
            <div class="muted">Book: ${pct(impO)} • Model: ${pct(p.over_prob)}</div>
            <span class="ev-green">EV ${pct(p.over_ev)}</span>
            <button class="parlay-btn"
              data-label="${p.player} Over ${p.point}"
              data-odds="${p.over_odds}"
              data-prob="${p.over_prob}">
              + Parlay
            </button>
          </div>

          <div class="prop-side signal-light">
            Under ${fmtOdds(p.under_odds)}
            <div class="muted">Book: ${pct(impU)} • Model: ${pct(p.under_prob)}</div>
            <span class="ev-green">EV ${pct(p.under_ev)}</span>
            <button class="parlay-btn"
              data-label="${p.player} Under ${p.point}"
              data-odds="${p.under_odds}"
              data-prob="${p.under_prob}">
              + Parlay
            </button>
          </div>
        </div>
      `;
    });
  });
  return html;
}

/* =======================
   EVENTS
   ======================= */

document.addEventListener("click", e => {
  const btn = e.target.closest(".parlay-btn");
  if (!btn) return;

  window.Parlay.addLeg({
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  });
});

/* =======================
   PARLAY UI
   ======================= */

function renderParlay() {
  const legs = document.getElementById("parlay-legs");
  const sum = document.getElementById("parlay-summary");
  const stake = Number(document.getElementById("parlay-stake").value || 0);

  legs.innerHTML = "";
  window.Parlay.legs.forEach((l, i) => {
    legs.innerHTML += `<div>${l.label} (${fmtOdds(l.odds)})</div>`;
  });

  const p = computeParlay();
  sum.innerHTML = `
    <div>${stake.toFixed(2)} to win ${(stake * p.mult).toFixed(2)}</div>
    <div>Prob ${pct(p.prob)}</div>
    <div class="${evClass(p.ev)}">EV ${pct(p.ev)}</div>
  `;
}

document.getElementById("parlay-stake").oninput = renderParlay;
