import { Teams } from "./teams.js";

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

// Convert American odds to implied probability
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
  if (value > 0.03) return "ev-green";
  if (value < -0.03) return "ev-red";
  return "ev-neutral";
}

// Format odds
function fmtOdds(o) {
  if (o === null || o === undefined) return "-";
  return o > 0 ? `+${o}` : `${o}`;
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
   GAME CARD RENDERING
   ============================================================ */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.id = game.id;  // <-- CRITICAL: Stores event ID

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};
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
      <div class="market-box">
        <div>Moneyline</div>
        <div>${away.abbr}: ${fmtOdds(best.ml.away.odds)}</div>
        <div>${home.abbr}: ${fmtOdds(best.ml.home.odds)}</div>
      </div>

      <div class="market-box">
        <div>Spread</div>
        <div>${away.abbr} ${best.spread.away.point} (${fmtOdds(best.spread.away.odds)})</div>
        <div>${home.abbr} ${best.spread.home.point} (${fmtOdds(best.spread.home.odds)})</div>
      </div>

      <div class="market-box">
        <div>Total</div>
        <div>Over ${best.total.over.point} (${fmtOdds(best.total.over.odds)})</div>
        <div>Under ${best.total.under.point} (${fmtOdds(best.total.under.odds)})</div>
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
          <div>${row.outcome1.name}: ${fmtOdds(row.outcome1.odds)}
            <span class="${evClass(row.outcome1.edge)}">EV ${pct(row.outcome1.edge)}</span>
          </div>
          <div>${row.outcome2.name}: ${fmtOdds(row.outcome2.odds)}
            <span class="${evClass(row.outcome2.edge)}">EV ${pct(row.outcome2.edge)}</span>
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
  acc.dataset.id = game.id;   // <-- CRITICAL: identify which event to fetch props for

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
          <div>${p.label ? p.label : ""} Line: ${p.point}</div>

          <div>Over ${fmtOdds(p.over_odds)}
            <span class="${evClass(p.over_ev)}">EV ${pct(p.over_ev)}</span>
            <span style="opacity:0.7;">(${pct(p.over_prob)})</span>
          </div>

          <div>Under ${fmtOdds(p.under_odds)}
            <span class="${evClass(p.under_ev)}">EV ${pct(p.under_ev)}</span>
            <span style="opacity:0.7;">(${pct(p.under_prob)})</span>
          </div>
        </div>
      `;
    });

    html += `</div>`;
  });

  return html;
}

/* ============================================================
   ACCORDION OPEN/CLOSE HANDLER
   ============================================================ */

function toggleAccordion(panel) {
  if (panel.style.maxHeight) {
    panel.style.maxHeight = null;
    panel.classList.remove("open");
  } else {
    panel.style.maxHeight = panel.scrollHeight + "px";
    panel.classList.add("open");
  }
}
