import { Teams } from "./teams.js";

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

// Convert American odds to implied probability (not used directly in UI now, but handy)
function implied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

// Percent format
function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

// EV color classification
function evClass(value) {
  if (value == null || Number.isNaN(value)) return "ev-neutral";
  if (value > 0.03) return "ev-green";
  if (value < -0.03) return "ev-red";
  return "ev-neutral";
}

// Format odds for display
function fmtOdds(o) {
  if (o === null || o === undefined) return "-";
  return o > 0 ? `+${o}` : `${o}`;
}

// Safe EV formatting
function fmtEV(ev) {
  if (ev == null || Number.isNaN(ev)) return "N/A";
  return pct(ev);
}

// Safe probability formatting
function fmtProb(p) {
  if (p == null || Number.isNaN(p)) return "N/A";
  return pct(p);
}

// Format kickoff time in local ET
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
   FETCH HELPERS
   ============================================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to fetch events");
  return r.json();
}

async function fetchProps(eventId) {
  const r = await fetch(`/api/props?id=${eventId}`);
  if (!r.ok) throw new Error("Failed to fetch props");
  return r.json();
}

/* ============================================================
   PAGE INITIALIZATION
   ============================================================ */

const container = document.getElementById("games-container");
const refreshBtn = document.getElementById("refresh-btn");

refreshBtn.addEventListener("click", async () => {
  container.innerHTML = `<div class="loading">Refreshing…</div>`;
  await loadGames();
});

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading NFL games…</div>`;

  let games;
  try {
    games = await fetchGames();
  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error">Failed to load games.</div>`;
    return;
  }

  container.innerHTML = "";

  if (!games.length) {
    container.innerHTML = `<div>No games available.</div>`;
    return;
  }

  games.forEach(game => {
    const card = createGameCard(game);
    container.appendChild(card);
  });
}

loadGames();

/* ============================================================
   GAME CARD RENDERING (TOP CARD WITH EDGE)
   ============================================================ */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.id = game.id; // event id used for props

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};
  const best = game.best;
  const kickoff = kickoffLocal(game.commence_time);

  const homeAbbr = home.abbr ? home.abbr.toUpperCase() : game.home_team;
  const awayAbbr = away.abbr ? away.abbr.toUpperCase() : game.away_team;

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
      <div class="market-box">
        <div>Moneyline</div>
        <div>
          ${awayAbbr}: ${fmtOdds(best.ml.away.odds)}
          <div class="${evClass(best.ml.away.ev)}" style="font-size:0.75rem;">
            EV ${fmtEV(best.ml.away.ev)} • Prob ${fmtProb(best.ml.away.consensus_prob)}
          </div>
        </div>
        <div>
          ${homeAbbr}: ${fmtOdds(best.ml.home.odds)}
          <div class="${evClass(best.ml.home.ev)}" style="font-size:0.75rem;">
            EV ${fmtEV(best.ml.home.ev)} • Prob ${fmtProb(best.ml.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div>Spread</div>
        <div>
          ${awayAbbr} ${best.spread.away.point} (${fmtOdds(best.spread.away.odds)})
          <div class="${evClass(best.spread.away.ev)}" style="font-size:0.75rem;">
            EV ${fmtEV(best.spread.away.ev)} • Prob ${fmtProb(best.spread.away.consensus_prob)}
          </div>
        </div>
        <div>
          ${homeAbbr} ${best.spread.home.point} (${fmtOdds(best.spread.home.odds)})
          <div class="${evClass(best.spread.home.ev)}" style="font-size:0.75rem;">
            EV ${fmtEV(best.spread.home.ev)} • Prob ${fmtProb(best.spread.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div>Total</div>
        <div>
          Over ${best.total.over.point} (${fmtOdds(best.total.over.odds)})
          <div class="${evClass(best.total.over.ev)}" style="font-size:0.75rem;">
            EV ${fmtEV(best.total.over.ev)} • Prob ${fmtProb(best.total.over.consensus_prob)}
          </div>
        </div>
        <div>
          Under ${best.total.under.point} (${fmtOdds(best.total.under.odds)})
          <div class="${evClass(best.total.under.ev)}" style="font-size:0.75rem;">
            EV ${fmtEV(best.total.under.ev)} • Prob ${fmtProb(best.total.under.consensus_prob)}
          </div>
        </div>
      </div>
    </div>
  `;

  // Add accordions
  const mainAcc = createMainAccordion(game);
  const propsAcc = createPropsAccordion(game);

  card.appendChild(mainAcc);
  card.appendChild(propsAcc);

  return card;
}

/* ============================================================
   MAIN MARKETS ACCORDION
   ============================================================ */

function createMainAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";

  acc.innerHTML = `<div class="accordion-title">Main Markets (All Books)</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  panel.innerHTML = buildMarketsTable(game);
  acc.appendChild(panel);

  acc.addEventListener("click", () => toggleAccordion(panel));
  return acc;
}

function buildMarketsTable(game) {
  const books = game.books;
  let html = "";

  ["h2h", "spreads", "totals"].forEach(key => {
    if (!books[key] || !books[key].length) return;
    html += `<h3>${key.toUpperCase()}</h3>`;

    books[key].forEach(row => {
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
   PLAYER PROPS ACCORDION
   ============================================================ */

function createPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.dataset.id = game.id;   // event id for props

  acc.innerHTML = `<div class="accordion-title">Player Props</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";
  acc.appendChild(panel);

  acc.addEventListener("click", async () => {
    const eventId = acc.dataset.id;

    if (!panel.dataset.loaded) {
      panel.innerHTML = `<div class="loading">Loading props…</div>`;

      try {
        const props = await fetchProps(eventId);
        panel.innerHTML = buildPropsUI(props);
        panel.dataset.loaded = "true";
      } catch (err) {
        console.error(err);
        panel.innerHTML = `<div class="error">Failed to load props.</div>`;
      }
    }

    toggleAccordion(panel);
  });

  return acc;
}

/* ============================================================
   BUILD PROPS UI
   ============================================================ */

function buildPropsUI(data) {
  if (!data || !data.categories) return `<div>No props available.</div>`;

  let html = "";
  const cats = data.categories;

  Object.keys(cats).forEach(cat => {
    html += `<div class="prop-category"><h3>${cat}</h3>`;

    cats[cat].forEach(p => {
      html += `
        <div class="prop-item">
          <div><strong>${p.player}</strong></div>
          <div>${p.label ? p.label + " — " : ""}Line: ${p.point}</div>

          <div>
            Over ${fmtOdds(p.over_odds)}
            <span class="${evClass(p.over_ev)}">
