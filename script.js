import { Teams } from "./teams.js";

/* ============================================================
   HELPERS
   ============================================================ */

const pct = x => (x * 100).toFixed(1) + "%";

function fmtOdds(o) {
  if (o == null) return "-";
  return o > 0 ? `+${o}` : `${o}`;
}

function evClass(e) {
  if (e == null || isNaN(e)) return "ev-neutral";
  if (e > 0.03) return "ev-green";
  if (e < -0.03) return "ev-red";
  return "ev-neutral";
}

function impliedProbFromOdds(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
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
   PARLAY ENGINE + STATE
   ============================================================ */

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
  return o > 0 ? (o / 100 + 1) : (100 / Math.abs(o) + 1);
}

function computeParlay() {
  if (!window.Parlay.legs.length) {
    return { mult: 0, prob: 0, ev: 0 };
  }

  let mult = 1;
  let prob = 1;

  window.Parlay.legs.forEach(l => {
    mult *= americanToDecimal(l.odds);
    prob *= l.prob ?? 0.5;
  });

  return {
    mult,
    prob,
    ev: (prob * mult) - 1
  };
}

/* ============================================================
   FETCH
   ============================================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Events failed");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  if (!r.ok) throw new Error("Props failed");
  return r.json();
}

/* ============================================================
   INIT
   ============================================================ */

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = loadGames;

loadGames();

/* ============================================================
   LOAD EVENTS
   ============================================================ */

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading games…</div>`;
  try {
    const games = await fetchGames();
    container.innerHTML = "";
    games.forEach(g => container.appendChild(createGameCard(g)));
  } catch {
    container.innerHTML = `<div class="error">Failed loading games</div>`;
  }
}

/* ============================================================
   GAME CARD
   ============================================================ */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" class="team-logo">
        ${game.away_team}
        <span class="muted">@</span>
        <img src="${home.logo}" class="team-logo">
        ${game.home_team}
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;
const marketsRow = document.createElement("div");
marketsRow.className = "markets-row";

marketsRow.appendChild(buildMarket("Moneyline", game.books.h2h, game));
marketsRow.appendChild(buildMarket("Spread", game.books.spreads, game));
marketsRow.appendChild(buildMarket("Total", game.books.totals, game));

card.appendChild(marketsRow);
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   AGGREGATED MARKET (BEST PRICE PER SIDE)
   ============================================================ */

function buildMarket(title, rows = [], game) {
  if (!rows.length) return document.createElement("div");

  const box = document.createElement("div");
  box.className = "market-box";
  box.innerHTML = `<div class="market-title">${title}</div>`;

  const outcomes = {};

  rows.forEach(r => {
    [r.outcome1, r.outcome2].forEach(o => {
      if (!outcomes[o.name] || o.odds > outcomes[o.name].odds) {
        outcomes[o.name] = o;
      }
    });
  });

  Object.values(outcomes).forEach(o => {
    const implied = impliedProbFromOdds(o.odds);

    const row = document.createElement("div");
    row.className = "market-row";

    row.innerHTML = `
      <div>
        <strong>${o.name}</strong> ${fmtOdds(o.odds)}
        <div class="muted">
          Book: ${pct(implied)} • Model: ${pct(o.fair)}
        </div>
      </div>
      <div class="${evClass(o.edge)}">EV ${pct(o.edge)}</div>
      <button class="parlay-btn market-parlay-btn"
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

/* ============================================================
   PLAYER PROPS
   ============================================================ */

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";

  const header = document.createElement("div");
  header.className = "accordion-title";
  header.textContent = "Player Props";

  const panel = document.createElement("div");
  panel.className = "panel";

  header.onclick = async e => {
    e.stopPropagation();

    if (panel.classList.contains("open")) {
      panel.classList.remove("open");
      panel.style.maxHeight = null;
      return;
    }

    panel.classList.add("open");
    panel.innerHTML = `<div class="loading">Loading props…</div>`;

    try {
      const data = await fetchProps(game.id);
      if (!data.categories || !Object.keys(data.categories).length) {
        panel.innerHTML = `<div class="muted">Props not posted yet</div>`;
      } else {
        panel.innerHTML = buildPropsUI(data.categories);
        panel.style.maxHeight = panel.scrollHeight + "px";
      }
    } catch {
      panel.innerHTML = `<div class="error">Unable to load props</div>`;
    }
  };

  acc.appendChild(header);
  acc.appendChild(panel);
  return acc;
}

/* ============================================================
   PROPS UI (NO INLINE JS)
   ============================================================ */

function buildPropsUI(categories) {
  let html = "";

  Object.entries(categories).forEach(([cat, props]) => {
    html += `<h4>${cat}</h4>`;

    props.forEach(p => {
      html += `
        <div class="prop-item">
          <div><strong>${p.player}</strong></div>
          <div>${p.label} ${p.point}</div>

          <div class="prop-side">
            Over ${fmtOdds(p.over_odds)}
            <div class="muted">
              Book: ${pct(impliedProbFromOdds(p.over_odds))}
              • Model: ${pct(p.over_prob)}
            </div>
            <span class="${evClass(p.over_ev)}">EV ${pct(p.over_ev)}</span>
            <button class="parlay-btn prop-parlay-btn"
              data-label="${p.player} Over ${p.point}"
              data-odds="${p.over_odds}"
              data-prob="${p.over_prob}">
              + Parlay
            </button>
          </div>

          <div class="prop-side">
            Under ${fmtOdds(p.under_odds)}
            <div class="muted">
              Book: ${pct(impliedProbFromOdds(p.under_odds))}
              • Model: ${pct(p.under_prob)}
            </div>
            <span class="${evClass(p.under_ev)}">EV ${pct(p.under_ev)}</span>
            <button class="parlay-btn prop-parlay-btn"
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

/* ============================================================
   DELEGATED PARLAY BUTTON HANDLER (CRITICAL FIX)
   ============================================================ */

document.addEventListener("click", e => {
  const btn = e.target.closest(".market-parlay-btn, .prop-parlay-btn");
  if (!btn) return;

  window.Parlay.addLeg({
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  });
});

/* ============================================================
   PARLAY SIDEBAR RENDER
   ============================================================ */

function renderParlay() {
  const legsBox = document.getElementById("parlay-legs");
  const summary = document.getElementById("parlay-summary");
  const stakeInput = document.getElementById("parlay-stake");

  if (!legsBox || !summary || !stakeInput) return;

  legsBox.innerHTML = "";

  window.Parlay.legs.forEach((l, i) => {
    legsBox.innerHTML += `
      <div class="parlay-leg">
        ${l.label} (${fmtOdds(l.odds)})
        <span onclick="window.Parlay.removeLeg(${i})">✖</span>
      </div>
    `;
  });

  const stake = Number(stakeInput.value || 0);
  const p = computeParlay();
  const payout = stake * p.mult;

  summary.innerHTML = `
    <div>${stake.toFixed(2)} to win ${payout.toFixed(2)}</div>
    <div>Prob: ${pct(p.prob)}</div>
    <div class="${evClass(p.ev)}">EV ${pct(p.ev)}</div>
  `;
}

document
  .getElementById("parlay-stake")
  ?.addEventListener("input", renderParlay);
