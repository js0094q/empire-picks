import { Teams } from "./teams.js";

/* ================================
   HELPERS
================================ */

const pct = x => `${(x * 100).toFixed(1)}%`;
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

function impliedProb(o) {
  if (!isFinite(o)) return NaN;
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

/* ================================
   CONSENSUS STRENGTH
================================ */

function consensusStrength(prob, ev) {
  const p = Math.min(Math.max((prob - 0.55) / 0.20, 0), 1);
  const e = Math.min(Math.max(ev / 0.25, 0), 1);
  const score = p * 0.6 + e * 0.4;

  if (score > 0.75) return "Strong";
  if (score > 0.5) return "Moderate";
  if (score > 0.3) return "Lean";
  return "Weak";
}

function consensusClass(label) {
  return `consensus-${label.toLowerCase()}`;
}

/* ================================
   STATE
================================ */

const autoPickCandidates = [];
const gamesContainer = document.getElementById("games-container");

/* ================================
   FETCH
================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Events fetch failed");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("Props fetch failed");
  return r.json();
}

/* ================================
   INIT
================================ */

document.getElementById("refresh-btn")?.addEventListener("click", loadGames);
loadGames();

/* ================================
   LOAD GAMES
================================ */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="muted">Loading NFL games…</div>`;
  autoPickCandidates.length = 0;

  try {
    const games = await fetchGames();
    gamesContainer.innerHTML = "";
    games.forEach(g => gamesContainer.appendChild(createGameCard(g)));
    renderTopPicks();
  } catch (e) {
    console.error(e);
    gamesContainer.innerHTML = `<div class="muted">Failed to load games.</div>`;
  }
}

/* ================================
   GAME CARD
================================ */

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}">
        ${game.away_team}
        <span>@</span>
        <img src="${home.logo}">
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

/* ================================
   MARKETS
================================ */

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

    trackPick(
      `${game.away_team} @ ${game.home_team} — ${o.name}`,
      o.odds,
      o.fair,
      o.edge
    );

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

/* ================================
   PROPS
================================ */

function isMeaningful(odds, prob) {
  return isFinite(odds) && isFinite(prob) && prob > 0.05 && prob < 0.85;
}

function buildPropsAccordion(game) {
  const acc = document.createElement("div");
  acc.className = "accordion";

  const title = document.createElement("div");
  title.className = "accordion-title";
  title.textContent = "Player Props";

  const panel = document.createElement("div");
  panel.className = "panel";

  let loaded = false;

  title.onclick = async () => {
    if (!panel.classList.toggle("open") || loaded) return;
    loaded = true;
    panel.innerHTML = `<div class="muted">Loading props…</div>`;

    try {
      const data = await fetchProps(game.id);
      panel.innerHTML = renderProps(data.categories || {});
    } catch {
      panel.innerHTML = `<div class="muted">Props unavailable.</div>`;
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

/* ================================
   PICK FILTER (CRITICAL)
================================ */

function trackPick(label, odds, prob, ev) {
  if (!isFinite(prob) || !isFinite(ev)) return;
  if (prob < 0.55 || prob > 0.75) return;
  if (ev <= 0.02 || ev > 0.25) return;
  if (/D\/ST|Defense|DST/i.test(label)) return;

  autoPickCandidates.push({ label, odds, prob, ev });
}

/* ================================
   TOP PICKS
================================ */

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

/* ================================
   PARLAY
================================ */

document.addEventListener("click", e => {
  const btn = e.target.closest(".parlay-btn");
  if (!btn) return;

  window.Parlay?.addLeg({
    label: btn.dataset.label,
    odds: Number(btn.dataset.odds),
    prob: Number(btn.dataset.prob)
  });
});
