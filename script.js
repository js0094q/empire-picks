import { Teams } from "./teams.js";

/* ============================================================
   HELPERS
   ============================================================ */

const pct = x => `${(x * 100).toFixed(1)}%`;
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function impliedProb(o) {
  if (o == null || !isFinite(o)) return NaN;
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

function signalClass(delta) {
  if (delta > 0.15) return "signal-strong";
  if (delta > 0.08) return "signal-medium";
  if (delta > 0.04) return "signal-light";
  return "signal-neutral";
}

function consensusStrength(prob, ev) {
  const score = prob * 0.7 + ev * 0.3;
  if (score > 0.45) return "Very High";
  if (score > 0.35) return "High";
  if (score > 0.25) return "Medium";
  return "Low";
}

function consensusClass(label) {
  return `consensus-${label.toLowerCase().replace(" ", "-")}`;
}

/* ============================================================
   STATE
   ============================================================ */

const autoPickCandidates = [];
const gamesContainer = document.getElementById("games-container");

/* ============================================================
   FETCH
   ============================================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to load events");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("Failed to load props");
  return r.json();
}

/* ============================================================
   INIT
   ============================================================ */

document.getElementById("refresh-btn")?.addEventListener("click", loadGames);
loadGames();

/* ============================================================
   LOAD GAMES
   ============================================================ */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  autoPickCandidates.length = 0;

  try {
    const games = await fetchGames();
    gamesContainer.innerHTML = "";
    games.forEach(g => gamesContainer.appendChild(createGameCard(g)));
    renderTopPicks();
  } catch (e) {
    console.error(e);
    gamesContainer.innerHTML = `<div class="muted">Unable to load games.</div>`;
  }
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
        <img src="${away.logo}" />
        ${game.away_team}
        <span>@</span>
        <img src="${home.logo}" />
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

  rows.forEach(r => {
    [r.outcome1, r.outcome2].forEach(o => {
      if (!o || !isFinite(o.odds)) return;
      if (!best[o.name] || o.odds > best[o.name].odds) best[o.name] = o;
    });
  });

  Object.values(best).forEach(o => {
    const imp = impliedProb(o.odds);
    const delta = o.fair - imp;

    if (o.edge > 0.03 && o.fair > 0.55) {
      autoPickCandidates.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: o.fair,
        ev: o.edge
      });
    }

    box.innerHTML += `
      <div class="market-row ${signalClass(delta)}">
        <div>
          <strong>${o.name}</strong> ${fmtOdds(o.odds)}
          <div class="muted">Book ${pct(imp)} • Model ${pct(o.fair)}</div>
        </div>
        <div class="ev-green">EV ${pct(o.edge)}</div>
        <button class="parlay-btn"
          data-label="${game.away_team} @ ${game.home_team} — ${o.name}"
          data-odds="${o.odds}"
          data-prob="${o.fair}">
          + Parlay
        </button>
      </div>
    `;
  });

  return box;
}

/* ============================================================
   PROPS
   ============================================================ */

function isMeaningful(odds, prob) {
  return isFinite(odds) && isFinite(prob) && prob > 0.02 && prob < 0.98;
}

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";

  const title = document.createElement("div");
  title.className = "accordion-title";
  title.textContent = "Player Props";

  const panel = document.createElement("div");
  panel.className = "panel";

  title.onclick = async () => {
    if (panel.classList.toggle("open")) {
      panel.innerHTML = `<div class="muted">Loading props…</div>`;
      try {
        const data = await fetchProps(game.id);
        panel.innerHTML = renderProps(data.categories || {});
        renderTopPicks();
      } catch {
        panel.innerHTML = `<div class="muted">No props available.</div>`;
      }
    }
  };

  acc.appendChild(title);
  acc.appendChild(panel);
  return acc;
}

function renderProps(categories) {
  let html = "";

  Object.entries(categories).forEach(([cat, props]) => {
    let section = `<h4>${cat}</h4>`;
    let any = false;

    props.forEach(p => {
      const sides = [];

      if (isMeaningful(p.over_odds, p.over_prob)) {
        sides.push(propSide(p, "Over"));
        trackPick(`${p.player} Over ${p.point}`, p.over_odds, p.over_prob, p.over_ev);
        any = true;
      }

      if (isMeaningful(p.under_odds, p.under_prob)) {
        sides.push(propSide(p, "Under"));
        trackPick(`${p.player} Under ${p.point}`, p.under_odds, p.under_prob, p.under_ev);
        any = true;
      }

      if (sides.length) {
        section += `
          <div class="prop-item">
            <strong>${p.player}</strong>
            <div class="muted">${p.label} ${p.point}</div>
            ${sides.join("")}
          </div>
        `;
      }
    });

    if (any) html += section;
  });

  return html || `<div class="muted">No playable props.</div>`;
}

function propSide(p, side) {
  const odds = side === "Over" ? p.over_odds : p.under_odds;
  const prob = side === "Over" ? p.over_prob : p.under_prob;
  const ev = side === "Over" ? p.over_ev : p.under_ev;
  const delta = prob - impliedProb(odds);

  return `
    <div class="prop-side ${signalClass(delta)}">
      ${side} ${fmtOdds(odds)}
      <div class="muted">Model ${pct(prob)}</div>
      <span class="ev-green">EV ${pct(ev)}</span>
      <button class="parlay-btn"
        data-label="${p.player} ${side} ${p.point}"
        data-odds="${odds}"
        data-prob="${prob}">
        + Parlay
      </button>
    </div>
  `;
}

function trackPick(label, odds, prob, ev) {
  if (ev > 0.03 && prob > 0.55) {
    autoPickCandidates.push({ label, odds, prob, ev });
  }
}

/* ============================================================
   PARLAY
   ============================================================ */

document.addEventListener("click", e => {
  const b = e.target.closest(".parlay-btn");
  if (!b) return;

  window.Parlay?.addLeg({
    label: b.dataset.label,
    odds: Number(b.dataset.odds),
    prob: Number(b.dataset.prob)
  });
});

/* ============================================================
   TOP PICKS (FEATURED)
   ============================================================ */

function renderTopPicks() {
  const box = document.getElementById("top-picks");
  if (!box) return;

  const picks = autoPickCandidates
    .sort((a, b) => b.prob * b.ev - a.prob * a.ev)
    .slice(0, 3);

  box.innerHTML = `
    <h3>Top Picks (Model-Weighted)</h3>
    ${picks.map(p => {
      const badge = consensusStrength(p.prob, p.ev);
      return `
        <div class="top-pick">
          <div>
            <strong>${p.label}</strong>
            <div class="muted">Prob ${pct(p.prob)} • EV ${pct(p.ev)}</div>
          </div>
          <span class="consensus-badge ${consensusClass(badge)}">${badge}</span>
        </div>
      `;
    }).join("")}
  `;
}
