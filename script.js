import { Teams } from "./teams.js";

// --------------------------------------------
// Utility functions
// --------------------------------------------

// Convert American odds → implied probability
function implied(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

// Format percent as xx.x%
function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

// EV color class
function evClass(value) {
  if (value > 0.03) return "ev-green";
  if (value < -0.03) return "ev-red";
  return "ev-neutral";
}

// Format odds nicely
function fmtOdds(o) {
  if (o > 0) return "+" + o;
  return o;
}

// Format local kickoff time
function kickoffLocal(utc) {
  return new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
}

// --------------------------------------------
// Fetch logic
// --------------------------------------------

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Error loading events");
  return r.json();
}

async function fetchProps(eventId) {
  const r = await fetch(`/api/props?id=${eventId}`);
  if (!r.ok) throw new Error("Props fetch error");
  return r.json();
}

// --------------------------------------------
// Render game list
// --------------------------------------------
const container = document.getElementById("games-container");
const refreshBtn = document.getElementById("refresh-btn");

refreshBtn.addEventListener("click", async () => {
  container.innerHTML = `<div class="loading">Refreshing...</div>`;
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
    container.innerHTML = `<div>No active games this week.</div>`;
    return;
  }

  games.forEach(game => {
    const card = createGameCard(game);
    container.appendChild(card);
  });
}

loadGames();

// --------------------------------------------
// Build Game Card
// --------------------------------------------
function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  const best = game.best; // from API aggregator
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
        <div>${best.ml.away.team}: ${fmtOdds(best.ml.away.odds)}</div>
        <div>${best.ml.home.team}: ${fmtOdds(best.ml.home.odds)}</div>
      </div>

      <div class="market-box">
        <div>Spread</div>
        <div>${best.spread.away.team} ${best.spread.away.point} (${fmtOdds(best.spread.away.odds)})</div>
        <div>${best.spread.home.team} ${best.spread.home.point} (${fmtOdds(best.spread.home.odds)})</div>
      </div>

      <div class="market-box">
        <div>Total</div>
        <div>Over ${best.total.over.point} (${fmtOdds(best.total.over.odds)})</div>
        <div>Under ${best.total.under.point} (${fmtOdds(best.total.under.odds)})</div>
      </div>
    </div>
  `;

  // Add two accordions: main markets + props
  const mainAcc = createMainAccordion(game);
  const propsAcc = createPropsAccordion(game);

  card.appendChild(mainAcc);
  card.appendChild(propsAcc);

  return card;
}

// --------------------------------------------
// Main Markets Accordion
// --------------------------------------------
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
  const books = game.books; // aggregated from server

  let html = "";

  ["h2h", "spreads", "totals"].forEach(key => {
    if (!books[key]) return;

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

// --------------------------------------------
// Props Accordion
// --------------------------------------------
function createPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.innerHTML = `<div class="accordion-title">Player Props</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  acc.appendChild(panel);

  acc.addEventListener("click", async () => {
    if (!panel.dataset.loaded) {
      panel.innerHTML = `<div class="loading">Loading props…</div>`;
      const props = await fetchProps(game.id);
      panel.innerHTML = buildPropsUI(props);
      panel.dataset.loaded = "true";
    }
    toggleAccordion(panel);
  });

  return acc;
}

// --------------------------------------------
// Categorized Props Rendering
// --------------------------------------------
function buildPropsUI(propsData) {
  if (!propsData || !propsData.categories) return `<div>No props available.</div>`;

  const cats = propsData.categories;

  let html = "";

  Object.keys(cats).forEach(catName => {
    html += `<div class="prop-category"><h3>${catName}</h3>`;

    cats[catName].forEach(p => {
      html += `
        <div class="prop-item">
          <div><strong>${p.player}</strong></div>
          <div>${p.label} — Line ${p.point}</div>
          <div>Over: ${fmtOdds(p.over_odds)} 
            <span class="${evClass(p.over_ev)}">EV ${pct(p.over_ev)}</span>  
            <span style="opacity:0.7;">(${pct(p.over_prob)})</span>
          </div>
          <div>Under: ${fmtOdds(p.under_odds)} 
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

// --------------------------------------------
// Accordion handler
// --------------------------------------------
function toggleAccordion(panel) {
  if (panel.style.maxHeight) {
    panel.style.maxHeight = null;
  } else {
    panel.style.maxHeight = panel.scrollHeight + "px";
  }
}

// --------------------------------------------
// End of Script
// --------------------------------------------