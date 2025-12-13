import { Teams } from "./teams.js";

/* ============================================================
   HELPERS
   ============================================================ */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function impliedProb(o) {
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

function evClass(ev) {
  if (ev > 0.03) return "ev-green";
  if (ev < -0.03) return "ev-red";
  return "ev-neutral";
}

function signalClass(delta) {
  if (delta > 0.15) return "signal-strong";
  if (delta > 0.08) return "signal-medium";
  if (delta > 0.04) return "signal-light";
  return "signal-neutral";
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
   AUTO PICK ENGINE
   ============================================================ */

const autoPickCandidates = [];

function pickScore(prob, ev) {
  return prob * ev;
}

/* ============================================================
   PARLAY ENGINE
   ============================================================ */

window.Parlay = {
  legs: [],
  addLeg(leg) {
    if (!this.legs.some(l => l.label === leg.label)) {
      this.legs.push(leg);
      renderParlay();
    }
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

  return {
    mult,
    prob,
    ev: prob * mult - 1
  };
}

/* ============================================================
   FETCH
   ============================================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  return r.json();
}

/* ============================================================
   INIT
   ============================================================ */

const gamesContainer = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = loadGames;

loadGames();

/* ============================================================
   LOAD GAMES
   ============================================================ */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  autoPickCandidates.length = 0;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(createGameCard(g)));

  renderTopPicks();
}

/* ============================================================
   GAME CARD
   ============================================================ */

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
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   MAIN MARKETS
   ============================================================ */

function buildMarket(title, rows, game) {
  const box = document.createElement("div");
  box.className = "market-box";
  box.innerHTML = `<div class="market-title">${title}</div>`;

  const best = {};

  rows.forEach(r =>
    [r.outcome1, r.outcome2].forEach(o => {
      if (!best[o.name] || o.odds > best[o.name].odds) {
        best[o.name] = o;
      }
    })
  );

  Object.values(best).forEach(o => {
    const implied = impliedProb(o.odds);
    const delta = o.fair - implied;

    if (o.edge > 0.03 && o.fair > 0.55) {
      autoPickCandidates.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: o.fair,
        ev: o.edge,
        score: pickScore(o.fair, o.edge)
      });
    }

    const row = document.createElement("div");
    row.className = `market-row ${signalClass(delta)}`;
    row.innerHTML = `
      <div>
        <strong>${o.name}</strong> ${fmtOdds(o.odds)}
        <div class="muted">
          Book: ${pct(implied)} • Model: ${pct(o.fair)}
        </div>
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

function isValidOdds(o) {
  return typeof o === "number" && isFinite(o) && o !== 0;
}

function isMeaningfulSide(odds, prob) {
  if (!isValidOdds(odds)) return false;
  if (!isFinite(prob) || prob <= 0.01 || prob >= 0.99) return false;
  return true;
}

function buildPropsUI(categories) {
  let html = "";

  Object.entries(categories).forEach(([cat, props]) => {
    let renderedAny = false;

    let section = `<h4>${cat}</h4>`;

    props.forEach(p => {
      const sides = [];

      // ---- OVER ----
      if (isMeaningfulSide(p.over_odds, p.over_prob)) {
        const impO = impliedProb(p.over_odds);
        const dO = p.over_prob - impO;

        sides.push(`
          <div class="prop-side ${signalClass(dO)}">
            Over ${fmtOdds(p.over_odds)}
            <div class="muted">
              Book ${pct(impO)} • Model ${pct(p.over_prob)}
            </div>
            <span class="ev-green">EV ${pct(p.over_ev)}</span>
            <button class="parlay-btn"
              data-label="${p.player} Over ${p.point}"
              data-odds="${p.over_odds}"
              data-prob="${p.over_prob}">
              + Parlay
            </button>
          </div>
        `);

        // Top-pick candidate
        if (p.over_ev > 0.03 && p.over_prob > 0.55) {
          autoPickCandidates.push({
            label: `${p.player} Over ${p.point}`,
            odds: p.over_odds,
            prob: p.over_prob,
            ev: p.over_ev,
            score: pickScore(p.over_prob, p.over_ev)
          });
        }
      }

      // ---- UNDER ----
      if (isMeaningfulSide(p.under_odds, p.under_prob)) {
        const impU = impliedProb(p.under_odds);
        const dU = p.under_prob - impU;

        sides.push(`
          <div class="prop-side ${signalClass(dU)}">
            Under ${fmtOdds(p.under_odds)}
            <div class="muted">
              Book ${pct(impU)} • Model ${pct(p.under_prob)}
            </div>
            <span class="ev-green">EV ${pct(p.under_ev)}</span>
            <button class="parlay-btn"
              data-label="${p.player} Under ${p.point}"
              data-odds="${p.under_odds}"
              data-prob="${p.under_prob}">
              + Parlay
            </button>
          </div>
        `);

        if (p.under_ev > 0.03 && p.under_prob > 0.55) {
          autoPickCandidates.push({
            label: `${p.player} Under ${p.point}`,
            odds: p.under_odds,
            prob: p.under_prob,
            ev: p.under_ev,
            score: pickScore(p.under_prob, p.under_ev)
          });
        }
      }

      // If neither side is real, skip player entirely
      if (!sides.length) return;

      renderedAny = true;

      section += `
        <div class="prop-item">
          <strong>${p.player}</strong>
          <div class="muted">${p.label} ${p.point}</div>
          ${sides.join("")}
        </div>
      `;
    });

    // Only add category if it rendered something real
    if (renderedAny) {
      html += section;
    }
  });

  return html || `<div class="muted">No playable props available.</div>`;
}

/* ============================================================
   GLOBAL EVENTS
   ============================================================ */

document.addEventListener("click", e => {
  const btn = e.target.closest(".parlay-btn");
  if (!btn) return;

  window.Parlay.addLeg({
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  });
});

/* ============================================================
   PARLAY UI
   ============================================================ */

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

/* ============================================================
   TOP PICKS
   ============================================================ */

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
        <button class="parlay-btn"
          data-label="${p.label}"
          data-odds="${p.odds}"
          data-prob="${p.prob}">
          + Parlay
        </button>
      </div>
    `).join("")}
  `;
}
