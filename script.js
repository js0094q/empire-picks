import { Teams } from "./teams.js";

/* ============================================================
   BOOK WEIGHTS
   ============================================================ */

const BOOK_WEIGHTS = {
  pinnacle: 1.35,
  circa: 1.30,
  bookmaker: 1.25,
  betonline: 1.20,

  draftkings: 0.95,
  fanduel: 0.95,
  caesars: 0.90,
  betmgm: 0.90,
  pointsbet: 0.85
};

const DEFAULT_BOOK_WEIGHT = 0.80;

/* ============================================================
   HELPERS
   ============================================================ */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function impliedProb(o) {
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
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
   SHARP-WEIGHTED FAIR PROBABILITY
   ============================================================ */

function weightedFairProb(outcomes) {
  let num = 0;
  let den = 0;

  outcomes.forEach(o => {
    const book = o.book?.toLowerCase() || "";
    const w = BOOK_WEIGHTS[book] ?? DEFAULT_BOOK_WEIGHT;
    const p = impliedProb(o.odds);

    num += p * w;
    den += w;
  });

  return den ? num / den : 0;
}

/* ============================================================
   CONSENSUS STRENGTH
   ============================================================ */

function strengthClass(prob) {
  return prob > 0.75 ? "strength-very-strong" :
         prob > 0.65 ? "strength-strong" :
         prob > 0.55 ? "strength-moderate" :
                       "strength-weak";
}

function strengthLabel(prob) {
  return prob > 0.75 ? "Very<br>Strong" :
         prob > 0.65 ? "Strong" :
         prob > 0.55 ? "Moderate" :
                       "Weak";
}

function strengthCircle(prob) {
  return `
    <div class="strength-circle ${strengthClass(prob)}">
      ${strengthLabel(prob)}
    </div>
  `;
}

/* ============================================================
   PARLAY MODAL
   ============================================================ */

const modal = document.getElementById("parlay-modal");
const backdrop = document.getElementById("parlay-backdrop");

const Parlay = {
  legs: [],
  add(leg) {
    if (!this.legs.find(l => l.label === leg.label)) {
      this.legs.push(leg);
    }

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

document.getElementById("close-parlay").onclick = () => {
  modal.classList.remove("open");
  backdrop.classList.remove("open");
};

backdrop.onclick = () => {
  modal.classList.remove("open");
  backdrop.classList.remove("open");
};

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
      </div>
    `;
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
    <div class="ev-green">EV ${pct(prob * mult - 1)}</div>
  `;
}

window.__removeLeg = i => Parlay.remove(i);
document.getElementById("parlay-stake").oninput = renderParlay;

/* ============================================================
   FETCH
   ============================================================ */

const fetchGames = async () =>
  (await fetch("/api/events")).json();

const fetchProps = async id =>
  (await fetch(`/api/props?id=${id}`)).json();

/* ============================================================
   TOP PICKS ENGINE
   ============================================================ */

const autoPickCandidates = [];

function pickScore(prob, ev) {
  return prob * ev;
}

function renderTopPicks() {
  const box = document.getElementById("top-picks");

  const picks = [...autoPickCandidates]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  box.innerHTML = `
    <h3>Top Picks (Model-Weighted)</h3>
    ${picks.map(p => `
      <div class="top-pick">
        <div>
          <strong>${p.label}</strong>
          <div class="muted">Prob ${pct(p.prob)} • EV ${pct(p.ev)}</div>
        </div>
        ${strengthCircle(p.prob)}
      </div>
    `).join("")}
  `;
}

/* ============================================================
   MARKET RENDERING
   ============================================================ */

function renderMarket(outcomes, game, label) {
  const fair = weightedFairProb(outcomes);

  outcomes.forEach(o => {
    const imp = impliedProb(o.odds);
    const edge = fair - imp;

    if (edge > 0.03 && fair > 0.55) {
      autoPickCandidates.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: fair,
        ev: edge,
        score: pickScore(fair, edge)
      });
    }
  });

  return outcomes.map(o => `
    <div class="market-row">
      <div>
        <strong>${o.name}</strong> ${fmtOdds(o.odds)}
        <div class="muted">Model ${pct(fair)}</div>
      </div>
      ${strengthCircle(fair)}
      <button class="parlay-btn"
        data-label="${label} — ${o.name}"
        data-odds="${o.odds}"
        data-prob="${fair}">
        + Parlay
      </button>
    </div>
  `).join("");
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
        <span>@</span>
        <img src="${home.logo}">
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  const markets = document.createElement("div");
  markets.className = "markets-row";

  ["h2h", "spreads", "totals"].forEach(key => {
    const box = document.createElement("div");
    box.className = "market-box";

    const byOutcome = {};

    game.books[key].forEach(b => {
      [b.outcome1, b.outcome2].forEach(o => {
        if (!byOutcome[o.name]) byOutcome[o.name] = [];
        byOutcome[o.name].push({ ...o, book: b.book });
      });
    });

    Object.values(byOutcome).forEach(outcomes => {
      box.innerHTML += renderMarket(outcomes, game, key.toUpperCase());
    });

    markets.appendChild(box);
  });

  card.appendChild(markets);
  card.appendChild(renderProps(game));

  return card;
}

/* ============================================================
   PROPS (UNCHANGED, WEIGHTS NOT APPLIED)
   ============================================================ */

function renderProps(game) {
  const wrap = document.createElement("div");
  wrap.className = "props-wrap";
  wrap.innerHTML = `<h4>Player Props</h4>`;

  fetchProps(game.id).then(data => {
    Object.values(data).forEach(props => {
      props.slice(0, 5).forEach(p => {
        ["over", "under"].forEach(side => {
          const odds = p[`${side}_odds`];
          const prob = p[`${side}_prob`];
          const ev = p[`${side}_ev`];

          if (!Number.isFinite(odds)) return;

          wrap.innerHTML += `
            <div class="market-row">
              <div>
                <strong>${p.player}</strong> ${side} ${p.point} ${fmtOdds(odds)}
                <div class="muted">Model ${pct(prob)}</div>
              </div>
              ${strengthCircle(prob)}
              <button class="parlay-btn"
                data-label="${p.player} ${side} ${p.point}"
                data-odds="${odds}"
                data-prob="${prob}">
                + Parlay
              </button>
            </div>
          `;
        });
      });
    });
  });

  return wrap;
}

/* ============================================================
   INIT
   ============================================================ */

const gamesContainer = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = loadGames;

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  autoPickCandidates.length = 0;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(createGameCard(g)));
  renderTopPicks();
}

loadGames();

/* ============================================================
   GLOBAL EVENTS
   ============================================================ */

document.addEventListener("click", e => {
  const btn = e.target.closest(".parlay-btn");
  if (!btn) return;

  Parlay.add({
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  });
});
