// ===================================================
// EmpirePicks — Layered Stable Script
// Markets + Props + Parlay + Top EV Banner
// ===================================================

const API_EVENTS = "/api/events";
const API_PROPS = "/api/props";
const container = document.getElementById("games-container");
const bannerRoot = document.getElementById("top-ev-banner");
const parlayState = [];

// -------------------------------
// Math Helpers
// -------------------------------

function impliedProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

function decimalOdds(odds) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

function noVig(p1, p2) {
  const t = p1 + p2;
  return [p1 / t, p2 / t];
}

function expectedValue(odds, modelProb) {
  return modelProb * decimalOdds(odds) - 1;
}

// -------------------------------
// Styling Logic
// -------------------------------

function evClass(ev) {
  if (ev >= 0.1) return "ev-elite";
  if (ev >= 0.05) return "ev-good";
  if (ev <= -0.05) return "ev-bad";
  return "ev-neutral";
}

function probGap(book, model) {
  return Math.abs(model - book);
}

// -------------------------------
// Parlay Logic
// -------------------------------

function addToParlay(item) {
  parlayState.push(item);
  console.log("Parlay:", parlayState);
}

// -------------------------------
// Render Helpers
// -------------------------------

function renderRow(o, allowParlay = true) {
  const row = document.createElement("div");
  row.className = `market-row ${evClass(o.ev)}`;

  row.innerHTML = `
    <div class="market-name">${o.name}</div>
    <div class="market-probs">
      Book ${(o.bookProb * 100).toFixed(1)}%
      · Model ${(o.modelProb * 100).toFixed(1)}%
    </div>
    <div class="market-ev">EV ${(o.ev * 100).toFixed(1)}%</div>
  `;

  if (allowParlay) {
    const btn = document.createElement("button");
    btn.className = "parlay-btn";
    btn.textContent = "+ Parlay";
    btn.onclick = () => addToParlay(o);
    row.appendChild(btn);
  }

  return row;
}

function renderMarket(title, outcomes) {
  const m = document.createElement("div");
  m.className = "market";

  const h = document.createElement("h4");
  h.textContent = title;
  m.appendChild(h);

  outcomes.forEach(o => m.appendChild(renderRow(o)));
  return m;
}

// -------------------------------
// Game Renderer
// -------------------------------

function renderGame(game, propsByEvent) {
  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="game-header">
      <h3>${game.away_team} @ ${game.home_team}</h3>
      <div>${new Date(game.commence_time).toLocaleString()}</div>
    </div>
  `;

  // -------- Moneyline / Spread / Total --------
  ["h2h", "spreads", "totals"].forEach(type => {
    const m = game.books?.[type]?.[0];
    if (!m) return;

    let o1, o2;

    if (type === "totals") {
      o1 = m.over;
      o2 = m.under;
    } else {
      o1 = m.outcome1;
      o2 = m.outcome2;
    }

    const p1 = impliedProb(o1.odds);
    const p2 = impliedProb(o2.odds);
    const [mp1, mp2] = noVig(p1, p2);

    card.appendChild(
      renderMarket(type.toUpperCase(), [
        {
          name: o1.name || `Over ${m.point}`,
          odds: o1.odds,
          bookProb: p1,
          modelProb: mp1,
          ev: expectedValue(o1.odds, mp1)
        },
        {
          name: o2.name || `Under ${m.point}`,
          odds: o2.odds,
          bookProb: p2,
          modelProb: mp2,
          ev: expectedValue(o2.odds, mp2)
        }
      ])
    );
  });

  // -------- Props (READ-ONLY) --------
  const props = propsByEvent[game.id];
  if (props?.length) {
    const box = document.createElement("div");
    box.className = "props-box";
    box.innerHTML = "<h4>Player Props</h4>";

    props.forEach(p => {
      if (!p.over || !p.under) return;

      const bp = impliedProb(p.over.odds);
      const up = impliedProb(p.under.odds);
      const [mpo, mpu] = noVig(bp, up);

      box.appendChild(
        renderRow(
          {
            name: `${p.player} ${p.market} Over ${p.line}`,
            odds: p.over.odds,
            bookProb: bp,
            modelProb: mpo,
            ev: expectedValue(p.over.odds, mpo)
          },
          false
        )
      );
    });

    card.appendChild(box);
  }

  return card;
}

// -------------------------------
// Top-3 EV Banner
// -------------------------------

function renderTopEV(all) {
  const top = all
    .filter(x => x.ev > 0)
    .sort((a, b) =>
      b.ev !== a.ev ? b.ev - a.ev : b.modelProb - a.modelProb
    )
    .slice(0, 3);

  if (!top.length) return;

  bannerRoot.innerHTML = `
    <div class="ev-banner">
      <strong>Top EV Picks</strong>
      ${top
        .map(
          t =>
            `<span>${t.name} · EV ${(t.ev * 100).toFixed(1)}%</span>`
        )
        .join("")}
    </div>
  `;
}

// -------------------------------
// Load Everything
// -------------------------------

async function load() {
  container.innerHTML = "Loading…";

  const [eventsRes, propsRes] = await Promise.all([
    fetch(API_EVENTS),
    fetch(API_PROPS)
  ]);

  const games = await eventsRes.json();
  const props = await propsRes.json();

  const propsByEvent = {};
  props.forEach(p => {
    propsByEvent[p.event_id] ||= [];
    propsByEvent[p.event_id].push(p);
  });

  container.innerHTML = "";
  const evCollector = [];

  games.forEach(g => {
    container.appendChild(renderGame(g, propsByEvent));
  });

  renderTopEV(evCollector);
}

load();
