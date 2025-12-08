// script.js — optimized to display new metrics
import { Teams } from "./teams.js";

/* HELPERS */

function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

function fmtOdds(o) {
  return o == null ? "-" : o > 0 ? `+${o}` : `${o}`;
}

function fmtProb(x) {
  return x == null ? "N/A" : pct(x);
}

function fmtEV(x) {
  return x == null ? "N/A" : pct(x);
}

function evClass(x) {
  if (x == null) return "ev-neutral";
  if (x > 0.02) return "ev-green";
  if (x < -0.02) return "ev-red";
  return "ev-neutral";
}

function kickoffLocal(utc) {
  return new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    weekday: "short",
    month: "short",
    day: "numeric"
  });
}

/* FETCH */

async function fetchGames() {
  return (await fetch("/api/events")).json();
}
async function fetchProps(id) {
  return (await fetch(`/api/props?id=${id}`)).json();
}

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = () => loadGames();

loadGames();

/* MAIN LOAD */

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading NFL games...</div>`;
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

/* CARD */

function createCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  const kickoff = kickoffLocal(game.commence_time);

  const topEV = Math.max(
    game.best.ml.home.ev,
    game.best.ml.away.ev,
    game.best.spread.home.ev,
    game.best.spread.away.ev,
    game.best.total.over.ev,
    game.best.total.under.ev
  );

  card.innerHTML = `
    <div class="ev-badge">
      Consensus Edge: <span class="${evClass(topEV)}">${fmtEV(topEV)}</span>
    </div>

    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" class="team-logo"> ${game.away_team}
        <span style="opacity:.6;">@</span>
        <img src="${home.logo}" class="team-logo"> ${game.home_team}
      </div>
      <div class="kickoff">${kickoff}</div>
    </div>

    ${buildMainGrid(game)}
  `;

  card.appendChild(buildAccordionMain(game));
  card.appendChild(buildAccordionProps(game));

  return card;
}

/* MARKET GRID */

function buildMainGrid(game) {
  const b = game.best;

  return `
    <div class="market-grid">

      <div class="market-box">
        <div class="box-title">Moneyline</div>

        <div>
          ${game.away_team} ${fmtOdds(b.ml.away.odds)}
          <div class="${evClass(b.ml.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.ml.away.ev)} • Prob ${fmtProb(b.ml.away.consensus_prob)}
          </div>
        </div>

        <div>
          ${game.home_team} ${fmtOdds(b.ml.home.odds)}
          <div class="${evClass(b.ml.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(b.ml.home.ev)} • Prob ${fmtProb(b.ml.home.consensus_prob)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div class="box-title">Spread</div>

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
        <div class="box-title">Total</div>

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

/* ACCORDIONS */

function buildAccordionMain(game) {
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
  let h = "";

  ["h2h", "spreads", "totals"].forEach(k => {
    if (!b[k]?.length) return;
    h += `<h3>${k.toUpperCase()}</h3>`;

    b[k].forEach(row => {
      h += `
        <div class="prop-item">
          <div><strong>${row.bookmaker}</strong></div>
          <div>${row.outcome1.name}: ${fmtOdds(row.outcome1.odds)}
            <span class="${evClass(row.outcome1.edge)}">EV ${fmtEV(row.outcome1.edge)}</span>
          </div>
          <div>${row.outcome2.name}: ${fmtOdds(row.outcome2.odds)}
            <span class="${evClass(row.outcome2.edge)}">EV ${fmtEV(row.outcome2.edge)}</span>
          </div>
        </div>`;
    });
  });

  return h;
}

/* PROPS ACCORDION */

function buildAccordionProps(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";
  acc.dataset.id = game.id;

  acc.innerHTML = `<div class="accordion-title">Player Props</div>`;

  const panel = document.createElement("div");
  panel.className = "panel";

  acc.onclick = async () => {
    if (!panel.dataset.loaded) {
      panel.innerHTML = `<div class="loading">Loading props...</div>`;
      try {
        const d = await fetchProps(game.id);
        panel.innerHTML = buildPropsUI(d.categories);
        panel.dataset.loaded = "true";
      } catch {
        panel.innerHTML = `<div class="error">Failed to load props.</div>`;
      }
    }
    toggle(panel);
  };

  acc.appendChild(panel);
  return acc;
}

function buildPropsUI(cats) {
  if (!cats) return `<div>No props available.</div>`;
  let h = "";

  Object.keys(cats).forEach(cat => {
    const arr = cats[cat];
    if (!arr.length) return;

    h += `<div class="prop-category"><h3>${cat}</h3>`;

    arr.forEach(p => {
      h += `
        <div class="prop-item">
          <div><strong>${p.player}</strong> — ${p.label}</div>
          <div>Line: ${p.point}</div>

          <div>
            Over ${fmtOdds(p.over_odds)}
            <span class="${evClass(p.over_ev)}">EV ${fmtEV(p.over_ev)}</span>
            (${fmtProb(p.over_prob)})
          </div>

          <div>
            Under ${fmtOdds(p.under_odds)}
            <span class="${evClass(p.under_ev)}">EV ${fmtEV(p.under_ev)}</span>
            (${fmtProb(p.under_prob)})
          </div>
        </div>`;
    });

    h += `</div>`;
  });

  return h;
}

/* COLLAPSE LOGIC */

function toggle(panel) {
  if (panel.style.maxHeight) {
    panel.style.maxHeight = null;
    panel.classList.remove("open");
  } else {
    panel.style.maxHeight = panel.scrollHeight + "px";
    panel.classList.add("open");
  }
}
