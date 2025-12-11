import { Teams } from "./teams.js";

/* ============================================================
   HELPERS
   ============================================================ */

function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

function fmtOdds(o) {
  if (o == null) return "-";
  return o > 0 ? `+${o}` : `${o}`;
}

function fmtEV(x) {
  if (x == null || isNaN(x)) return "N/A";
  return pct(x);
}

function fmtProb(x) {
  if (x == null || isNaN(x)) return "N/A";
  return pct(x);
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
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
}

/* ============================================================
   PARLAY ENGINE
   ============================================================ */

window.Parlay = {
  legs: [],

  addLeg(leg) {
    // Prevent duplicate exact legs
    if (!this.legs.some(l => l.label === leg.label && l.odds === leg.odds)) {
      this.legs.push(leg);
    }
    renderParlay();
  },

  removeLeg(i) {
    this.legs.splice(i, 1);
    renderParlay();
  }
};

function americanToDecimal(odds) {
  if (odds > 0) return (odds / 100) + 1;
  return (100 / Math.abs(odds)) + 1;
}

function computeParlay() {
  if (!window.Parlay.legs.length) return { payout: 0, prob: 0, ev: 0 };

  let payout = 1;
  let prob = 1;

  window.Parlay.legs.forEach(l => {
    payout *= americanToDecimal(l.odds);
    prob *= l.prob || 0.5;
  });

  const ev = (prob * payout) - 1;

  return { payout, prob, ev };
}

function renderParlay() {
  const box = document.getElementById("parlay-legs");
  const sum = document.getElementById("parlay-summary");

  if (!box || !sum) return;

  box.innerHTML = "";
  window.Parlay.legs.forEach((l, i) => {
    box.innerHTML += `
      <div class="parlay-leg">
        ${l.label} (${fmtOdds(l.odds)})
        <span class="remove-leg" onclick="window.Parlay.removeLeg(${i})">✖</span>
      </div>
    `;
  });

  const { payout, prob, ev } = computeParlay();

  sum.innerHTML = `
    <hr>
    <div><strong>Legs:</strong> ${window.Parlay.legs.length}</div>
    <div><strong>Payout Multiplier:</strong> ${payout.toFixed(2)}x</div>
    <div><strong>Probability:</strong> ${fmtProb(prob)}</div>
    <div><strong>Expected Value:</strong> 
      <span class="${evClass(ev)}">${fmtEV(ev)}</span>
    </div>
  `;
}

/* ============================================================
   FETCH HELPERS
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
   INITIAL LOAD & APP STATE
   ============================================================ */

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = () => loadGames();

window.AppState = {
  games: {},
  lastUpdated: null
};

loadGames();

/* ============================================================
   PRIMARY LOAD FUNCTION
   ============================================================ */

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading NFL games…</div>`;

  let games = [];
  try {
    games = await fetchGames();
  } catch {
    container.innerHTML = `<div class="error">API Error</div>`;
    return;
  }

  container.innerHTML = "";

  games.forEach(g => {
    window.AppState.games[g.id] = g;
    container.appendChild(createCard(g));
  });

  window.AppState.lastUpdated = Date.now();
}

/* ============================================================
   AUTO REFRESH ENGINE
   ============================================================ */

const REFRESH_MS = 30000;

setInterval(async () => {
  try {
    const newGames = await fetchGames();

    newGames.forEach(g => {
      const old = window.AppState.games[g.id];

      if (!old) {
        window.AppState.games[g.id] = g;
        container.appendChild(createCard(g));
        return;
      }

      updateCard(old, g);
      window.AppState.games[g.id] = g;
    });

    window.AppState.lastUpdated = Date.now();
  } catch (err) {
    console.error("Auto-refresh error:", err);
  }
}, REFRESH_MS);

/* ============================================================
   CARD CREATION
   ============================================================ */

function createCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.id = game.id;

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  const homeAbbr = home.abbr?.toUpperCase() || game.home_team;
  const awayAbbr = away.abbr?.toUpperCase() || game.away_team;

  const best = game.best;
  const kickoff = kickoffLocal(game.commence_time);

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" class="team-logo">
        ${game.away_team}
        <span style="opacity:0.6;"> @ </span>
        <img src="${home.logo}" class="team-logo">
        ${game.home_team}
      </div>
      <div class="kickoff">${kickoff}</div>
    </div>

    <div class="market-grid">

      <!-- MONEYLINE -->
      <div class="market-box">
        <div>Moneyline</div>

        <div>
          ${awayAbbr}: ${fmtOdds(best.ml.away.odds)}
          <div class="${evClass(best.ml.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.ml.away.ev)} • Prob ${fmtProb(best.ml.away.consensus_prob)}
          </div>
          <button class="parlay-btn"
            onclick='window.Parlay.addLeg({
              label: "${awayAbbr} ML",
              odds: ${best.ml.away.odds},
              prob: ${best.ml.away.consensus_prob}
            })'>➕ Parlay</button>
        </div>

        <div>
          ${homeAbbr}: ${fmtOdds(best.ml.home.odds)}
          <div class="${evClass(best.ml.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.ml.home.ev)} • Prob ${fmtProb(best.ml.home.consensus_prob)}
          </div>
          <button class="parlay-btn"
            onclick='window.Parlay.addLeg({
              label: "${homeAbbr} ML",
              odds: ${best.ml.home.odds},
              prob: ${best.ml.home.consensus_prob}
            })'>➕ Parlay</button>
        </div>
      </div>

      <!-- SPREAD -->
      <div class="market-box">
        <div>Spread</div>

        <div>
          ${awayAbbr} ${best.spread.away.point} (${fmtOdds(best.spread.away.odds)})
          <div class="${evClass(best.spread.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.spread.away.ev)} • Prob ${fmtProb(best.spread.away.consensus_prob)}
          </div>
          <button class="parlay-btn"
            onclick='window.Parlay.addLeg({
              label: "${awayAbbr} Spread ${best.spread.away.point}",
              odds: ${best.spread.away.odds},
              prob: ${best.spread.away.consensus_prob}
            })'>➕ Parlay</button>
        </div>

        <div>
          ${homeAbbr} ${best.spread.home.point} (${fmtOdds(best.spread.home.odds)})
          <div class="${evClass(best.spread.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.spread.home.ev)} • Prob ${fmtProb(best.spread.home.consensus_prob)}
          </div>
          <button class="parlay-btn"
            onclick='window.Parlay.addLeg({
              label: "${homeAbbr} Spread ${best.spread.home.point}",
              odds: ${best.spread.home.odds},
              prob: ${best.spread.home.consensus_prob}
            })'>➕ Parlay</button>
        </div>
      </div>

      <!-- TOTAL -->
      <div class="market-box">
        <div>Total</div>

        <div>
          Over ${best.total.over.point} (${fmtOdds(best.total.over.odds)})
          <div class="${evClass(best.total.over.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.total.over.ev)} • Prob ${fmtProb(best.total.over.consensus_prob)}
          </div>
          <button class="parlay-btn"
            onclick='window.Parlay.addLeg({
              label: "Over ${best.total.over.point}",
              odds: ${best.total.over.odds},
              prob: ${best.total.over.consensus_prob}
            })'>➕ Parlay</button>
        </div>

        <div>
          Under ${best.total.under.point} (${fmtOdds(best.total.under.odds)})
          <div class="${evClass(best.total.under.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.total.under.ev)} • Prob ${fmtProb(best.total.under.consensus_prob)}
          </div>
          <button class="parlay-btn"
            onclick='window.Parlay.addLeg({
              label: "Under ${best.total.under.point}",
              odds: ${best.total.under.odds},
              prob: ${best.total.under.consensus_prob}
            })'>➕ Parlay</button>
        </div>
      </div>

    </div>
  `;

  card.appendChild(buildMainAccordion(game));
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   UPDATE CARD
   ============================================================ */

function updateCard(oldGame, newGame) {
  const card = document.querySelector(`.game-card[data-id="${newGame.id}"]`);
  if (!card) return;

  const changed = JSON.stringify(oldGame.best) !== JSON.stringify(newGame.best);

  if (!changed) return;

  const fresh = createCard(newGame);
  card.replaceWith(fresh);

  fresh.classList.add("updated");
  setTimeout(() => fresh.classList.remove("updated"), 1200);
}

/* ============================================================
   MAIN MARKETS ACCORDION
   ============================================================ */

function buildMainAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.innerHTML = `<div class="accordion-title">Main Markets (All Books)</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  panel.innerHTML = buildMarketsTable(game);

  acc.onclick = () => toggle(panel);
  acc.appendChild(panel);
  return acc;
}

function buildMarketsTable(game) {
  const b = game.books;
  let html = "";

  ["h2h", "spreads", "totals"].forEach(key => {
    if (!b[key] || !b[key].length) return;

    html += `<h3>${key.toUpperCase()}</h3>`;

    b[key].forEach(row => {
      html += `
        <div class="prop-item">
          <div><strong>${row.bookmaker}</strong></div>

          <div>
            ${row.outcome1.name}: ${fmtOdds(row.outcome1.odds)}
            <span class="${evClass(row.outcome1.edge)}">EV ${fmtEV(row.outcome1.edge)}</span>
          </div>

          <div>
            ${row.outcome2.name}: ${fmtOdds(row.outcome2.odds)}
            <span class="${evClass(row.outcome2.edge)}">EV ${fmtEV(row.outcome2.edge)}</span>
          </div>
        </div>
      `;
    });
  });

  return html;
}

/* ============================================================
   PLAYER PROPS ACCORDION (WITH PARLAY BUTTONS)
   ============================================================ */

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.dataset.id = game.id;
  acc.innerHTML = `<div class="accordion-title">Player Props</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  acc.onclick = async () => {
    toggle(panel);

    if (panel.classList.contains("open")) {
      panel.innerHTML = `<div class="loading">Loading props…</div>`;
      try {
        const data = await fetchProps(game.id);
        panel.innerHTML = buildPropsUI(data.categories);
      } catch {
        panel.innerHTML = `<div class="error">Failed to load props</div>`;
      }
    }
  };

  acc.appendChild(panel);
  return acc;
}

function buildPropsUI(cats) {
  if (!cats) return `<div>No props available</div>`;

  let html = "";

  Object.keys(cats).forEach(cat => {
    const arr = cats[cat];
    if (!arr.length) return;

    html += `<div class="prop-category"><h3>${cat}</h3>`;

    arr.forEach(p => {
      html += `
        <div class="prop-item">
          <div><strong>${p.player}</strong></div>
          <div>${p.label}: ${p.point}</div>

          <div>
            Over ${fmtOdds(p.over_odds)}
            <span class="${evClass(p.over_ev)}">EV ${fmtEV(p.over_ev)}</span>
            <span style="opacity:.7;">(${fmtProb(p.over_prob)})</span>
            <button class="parlay-btn"
              onclick='window.Parlay.addLeg({
                label: "${p.player} Over ${p.point}",
                odds: ${p.over_odds},
                prob: ${p.over_prob}
              })'>➕ Parlay</button>
          </div>

          <div>
            Under ${fmtOdds(p.under_odds)}
            <span class="${evClass(p.under_ev)}">EV ${fmtEV(p.under_ev)}</span>
            <span style="opacity:.7;">(${fmtProb(p.under_prob)})</span>
            <button class="parlay-btn"
              onclick='window.Parlay.addLeg({
                label: "${p.player} Under ${p.point}",
                odds: ${p.under_odds},
                prob: ${p.under_prob}
              })'>➕ Parlay</button>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  return html;
}

/* ============================================================
   ACCORDION LOGIC
   ============================================================ */

function toggle(panel) {
  if (panel.style.maxHeight) {
    panel.style.maxHeight = null;
    panel.classList.remove("open");
  } else {
    panel.style.maxHeight = panel.scrollHeight + "px";
    panel.classList.add("open");
  }
}
