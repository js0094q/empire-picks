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

  games.forEach(g => {
    container.appendChild(createCard(g));
  });
}

/* ============================================================
   CARD RENDERING
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

      <div class="market-box">
        <div>Moneyline</div>
        <div>
          ${awayAbbr}: ${fmtOdds(best.ml.away.odds)}
          <div class="${evClass(best.ml.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.ml.away.ev)} • Prob ${fmtProb(best.ml.away.consensus_prob)}
          </div>
        </div>
        <div>
          ${homeAbbr}: ${fmtOdds(best.ml.home.odds)}
          <div class="${evClass(best.ml.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.ml.home.ev)} • Prob ${fmtProb(best.ml.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div>Spread</div>
        <div>
          ${awayAbbr} ${best.spread.away.point} (${fmtOdds(best.spread.away.odds)})
          <div class="${evClass(best.spread.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.spread.away.ev)} • Prob ${fmtProb(best.spread.away.consensus_prob)}
          </div>
        </div>
        <div>
          ${homeAbbr} ${best.spread.home.point} (${fmtOdds(best.spread.home.odds)})
          <div class="${evClass(best.spread.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.spread.home.ev)} • Prob ${fmtProb(best.spread.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div>Total</div>
        <div>
          Over ${best.total.over.point} (${fmtOdds(best.total.over.odds)})
          <div class="${evClass(best.total.over.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.total.over.ev)} • Prob ${fmtProb(best.total.over.consensus_prob)}
          </div>
        </div>
        <div>
          Under ${best.total.under.point} (${fmtOdds(best.total.under.odds)})
          <div class="${evClass(best.total.under.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.total.under.ev)} • Prob ${fmtProb(best.total.under.consensus_prob)}
          </div>
        </div>
      </div>

    </div>
  `;

  card.appendChild(buildMainAccordion(game));
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   MAIN MARKET ACCORDION
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
            <span class="${evClass(row.outcome1.edge)}">
              EV ${fmtEV(row.outcome1.edge)}
            </span>
          </div>

          <div>
            ${row.outcome2.name}: ${fmtOdds(row.outcome2.odds)}
            <span class="${evClass(row.outcome2.edge)}">
              EV ${fmtEV(row.outcome2.edge)}
            </span>
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

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.dataset.id = game.id;
  acc.innerHTML = `<div class="accordion-title">Player Props</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  acc.onclick = async () => {
    const id = acc.dataset.id;

    if (!panel.dataset.loaded) {
      panel.innerHTML = `<div class="loading">Loading props…</div>`;
      try {
        const data = await fetchProps(id);
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

/* ============================================================
   BUILD PROPS UI
   ============================================================ */

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
