import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x * 100).toFixed(1) + "%";
const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

const impliedProb = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const consensusLabel = p =>
  p > 0.75 ? "Very Strong" :
  p > 0.65 ? "Strong" :
  p > 0.55 ? "Moderate" : "Weak";

const kickoffLocal = utc =>
  new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

/* =========================================================
   STATE
   ========================================================= */

const gamesContainer = document.getElementById("games-container");
const topPickPool = [];
const Parlay = { legs: [] };

/* =========================================================
   INIT
   ========================================================= */

document.getElementById("refresh-btn").onclick = loadGames;
loadGames();

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () =>
  (await fetch("/api/events")).json();

const fetchProps = async gameId =>
  (await fetch(`/api/props?id=${gameId}`)).json();

/* =========================================================
   LOAD GAMES
   ========================================================= */

async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading NFL games…</div>`;
  topPickPool.length = 0;

  const games = await fetchGames();
  gamesContainer.innerHTML = "";

  games.forEach(g => gamesContainer.appendChild(buildGameCard(g)));
  renderTopPicks();
}

/* =========================================================
   GAME CARD
   ========================================================= */

function buildGameCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}">
        <span>@</span>
        <img src="${home.logo}">
      </div>
      <div class="kickoff">${kickoffLocal(game.commence_time)}</div>
    </div>
  `;

  const markets = document.createElement("div");
  markets.className = "markets-row";

  ["h2h", "spreads", "totals"].forEach(k => {
    if (game.books?.[k]) markets.appendChild(buildMarket(game, k));
  });

  card.appendChild(markets);

  /* ================= PROPS (ALWAYS RENDERED) ================= */

  const propsWrap = document.createElement("div");
  propsWrap.className = "props-container";
  propsWrap.innerHTML = `<div class="muted">Loading player props…</div>`;
  card.appendChild(propsWrap);

  fetchProps(game.id)
    .then(data => renderProps(propsWrap, data.categories))
    .catch(() => {
      propsWrap.innerHTML = `<div class="muted">Props unavailable</div>`;
    });

  return card;
}

/* =========================================================
   MARKETS + STRENGTH + PARLAY
   ========================================================= */

function buildMarket(game, key) {
  const box = document.createElement("div");
  box.className = "market-box";

  const best = {};
  game.books[key].forEach(b =>
    [b.outcome1, b.outcome2].forEach(o => {
      if (!best[o.name] || o.odds > best[o.name].odds) best[o.name] = o;
    })
  );

  Object.values(best).forEach(o => {
    const imp = impliedProb(o.odds);
    const edge = o.fair - imp;
    const label = consensusLabel(o.fair);

    if (edge > 0.04 && o.fair > 0.55) {
      topPickPool.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        prob: o.fair,
        ev: edge,
        score: o.fair * edge
      });
    }

    const row = document.createElement("div");
    row.className = "market-row";

    row.innerHTML = `
      <div>
        <strong>${o.name}</strong> ${fmtOdds(o.odds)}
        <div class="muted">Book ${pct(imp)} • Model ${pct(o.fair)}</div>
      </div>
      <span class="badge">${label}</span>
      <button class="parlay-btn">+ Parlay</button>
    `;

    row.querySelector(".parlay-btn").onclick = () => {
      Parlay.legs.push({
        label: `${game.away_team} @ ${game.home_team} — ${o.name}`,
        odds: o.odds,
        prob: o.fair
      });
      alert("Added to parlay");
    };

    box.appendChild(row);
  });

  return box;
}

/* =========================================================
   PROPS
   ========================================================= */

function renderProps(container, categories) {
  container.innerHTML = "";

  Object.entries(categories || {}).forEach(([cat, props]) => {
    if (!props || !props.length) return;

    const sec = document.createElement("div");
    sec.className = "prop-category";
    sec.innerHTML = `<strong>${cat}</strong>`;

    props.slice(0, 4).forEach(p => {
      const best =
        p.over_ev > p.under_ev
          ? { side: "Over", ev: p.over_ev }
          : { side: "Under", ev: p.under_ev };

      sec.innerHTML += `
        <div class="prop-row">
          <div>${p.player}</div>
          <div>${best.side} ${p.point}</div>
          <div class="ev-green">EV ${pct(best.ev)}</div>
        </div>
      `;
    });

    container.appendChild(sec);
  });
}

/* =========================================================
   TOP PICKS
   ========================================================= */

function renderTopPicks() {
  const box = document.getElementById("top-picks");
  if (!box) return;

  const picks = [...topPickPool]
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  box.innerHTML = `
    <h3>Top Picks</h3>
    ${picks.map(p => `
      <div class="top-pick">
        <strong>${p.label}</strong>
        <div class="muted">Prob ${pct(p.prob)} • EV ${pct(p.ev)}</div>
      </div>
    `).join("")}
  `;
}
