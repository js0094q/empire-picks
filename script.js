// script.js — now displays which market has the top consensus edge
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

function fmtProb(x) {
  if (x == null || isNaN(x)) return "N/A";
  return pct(x);
}

function fmtEV(x) {
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
    day: "numeric",
    weekday: "short"
  });
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
   INITIAL LOAD
   ============================================================ */

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = () => loadGames();

loadGames();

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
  games.forEach(g => container.appendChild(createCard(g)));
}

/* ============================================================
   DETERMINE THE BEST MARKET (NEW FEATURE)
   ============================================================ */

function findBestMarket(game) {
  const b = game.best;

  const list = [
    { label: `${game.away_team} ML`, ev: b.ml.away.ev },
    { label: `${game.home_team} ML`, ev: b.ml.home.ev },

    { label: `${game.away_team} ${b.spread.away.point} Spread`, ev: b.spread.away.ev },
    { label: `${game.home_team} ${b.spread.home.point} Spread`, ev: b.spread.home.ev },

    { label: `Over ${b.total.over.point}`, ev: b.total.over.ev },
    { label: `Under ${b.total.under.point}`, ev: b.total.under.ev }
  ];

  // Remove null EV items
  const filtered = list.filter(x => x.ev != null);

  // Pick highest EV
  const best = filtered.reduce((a, c) => (c.ev > a.ev ? c : a), filtered[0]);

  return best;
}

/* ============================================================
   CARD RENDERING
   ============================================================ */

function createCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  const kickoff = kickoffLocal(game.commence_time);

  // NEW FEATURE — find which market produced the highest EV
  const bestMarket = findBestMarket(game);

  card.innerHTML = `
    <div class="ev-badge">
      Consensus Edge: 
      <span class="${evClass(bestMarket.ev)}">${fmtEV(bestMarket.ev)}</span>
      <div style="font-size:.75rem; opacity:.85;">${bestMarket.label}</div>
    </div>

    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" class="team-logo">
        ${game.away_team}
        <span style="opacity:.6;"> @ </span>
        <img src="${home.logo}" class="team-logo">
        ${game.home_team}
      </div>
      <div class="kickoff">${kickoff}</div>
    </div>

    ${buildMainGrid(game)}
  `;

  card.appendChild(buildMainAccordion(game));
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   MARKET GRID
   ============================================================ */

function buildMainGrid(game) {
  const b = game.best;

  return `
    <div class="market-grid">

      <div class="market-box">
        <div>Moneyline</div>
        <div>
          ${game.away_team}: ${fmtOdds(b.ml.away.odds)}
          <div class="${evClass(b.ml.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.ml.away.ev)} • Prob ${fmtProb(b.ml.away.consensus_prob)}
          </div>
        </div>
        <div>
          ${game.home_team}: ${fmtOdds(b.ml.home.odds)}
          <div class="${evClass(b.ml.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.ml.home.ev)} • Prob ${fmtProb(b.ml.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div>Spread</div>
        <div>
          ${game.away_team} ${b.spread.away.point} (${fmtOdds(b.spread.away.odds)})
          <div class="${evClass(b.spread.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.spread.away.ev)} • Prob ${fmtProb(b.spread.away.consensus_prob)}
          </div>
        </div>
        <div>
          ${game.home_team} ${b.spread.home.point} (${fmtOdds(b.spread.home.odds)})
          <div class="${evClass(b.spread.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.spread.home.ev)} • Prob ${fmtProb(b.spread.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div>Total</div>
        <div>
          Over ${b.total.over.point} (${fmtOdds(b.total.over.odds)})
          <div class="${evClass(b.total.over.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.total.over.ev)} • Prob ${fmtProb(b.total.over.consensus_prob)}
          </div>
        </div>
        <div>
          Under ${b.total.under.point} (${fmtOdds(b.total.under.odds)})
          <div class="${evClass(b.total.under.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.total.under.ev)} • Prob ${fmtProb(b.total.under.consensus_prob)}
          </div>
        </div>
      </div>

    </div>
  `;
}

/* ============================================================
   MAIN MARKET ACCORDION
   ============================================================ */

function buildMainAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.innerHTML = `<div class="accordion-title">Full Market Breakdown (All Books)</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  panel.innerHTML = buildMarketTable(game);

  acc.onclick = () => toggle(panel);
  acc.appendChild(panel);
  return acc;
}

function buildMarketTable(game) {
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
        </div>`;
    });
  });

  return html;
}

/* ============================================================
   PLAYER PROPS ACCORDION
   ============================================================ */

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.dataset.id = game.id;
  acc.innerHTML = `<div class="accordion-title">Player Props</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  acc.onclick = async () => {
    if (!panel.dataset.loaded) {
      panel.innerHTML = `<div class="loading">Loading props…</div>`;
      try {
        const data = await fetchProps(game.id);
        panel.innerHTML = buildPropsUI(data.categories);
        panel.dataset.loaded = "true";
      } catch {
        panel.innerHTML = `<div class="error">Failed to load props</div>`;
      }
    }
    toggle(panel);
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
          </div>

          <div>
            Under ${fmtOdds(p.under_odds)}
            <span class="${evClass(p.under_ev)}">EV ${fmtEV(p.under_ev)}</span>
            <span style="opacity:.7;">(${fmtProb(p.under_prob)})</span>
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
