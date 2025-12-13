/******************************************************
 * EMPIREPICKS — CORE APP LOGIC
 ******************************************************/

const API_EVENTS = "/api/events";
const API_PROPS  = "/api/props";

let PARLAY = [];

/******************************************************
 * UTILITIES
 ******************************************************/

function americanToImplied(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

function formatPct(x) {
  return (x * 100).toFixed(1) + "%";
}

function decimalOdds(odds) {
  return odds > 0
    ? 1 + odds / 100
    : 1 + 100 / Math.abs(odds);
}

/******************************************************
 * MODEL PROBABILITY (IMPORTANT)
 *
 * Model Prob = normalized, no-vig consensus
 *
 * Steps:
 * 1. Convert all bookmaker odds → implied probs
 * 2. Average them
 * 3. Normalize so outcomes sum to 100%
 *
 * This reflects "what the books think will happen"
 ******************************************************/

function modelProbability(outcomes) {
  const total = outcomes.reduce((s, o) => s + o.implied, 0);
  return outcomes.map(o => ({
    ...o,
    modelProb: o.implied / total
  }));
}

/******************************************************
 * EV CALCULATION
 *
 * EV = (Model Prob × Decimal Odds) − 1
 ******************************************************/

function expectedValue(modelProb, odds) {
  return (modelProb * decimalOdds(odds)) - 1;
}

/******************************************************
 * PARLAY LOGIC
 ******************************************************/

function addToParlay(leg) {
  const exists = PARLAY.some(
    p => p.id === leg.id
  );
  if (exists) return;

  PARLAY.push(leg);
  renderParlay();
}

function removeFromParlay(id) {
  PARLAY = PARLAY.filter(p => p.id !== id);
  renderParlay();
}

function renderParlay() {
  const el = document.getElementById("parlay-items");
  const stakeInput = document.getElementById("stake");

  if (!el) return;
  el.innerHTML = "";

  if (!PARLAY.length) {
    el.innerHTML = `<div class="muted">No selections</div>`;
    updateParlayMath();
    return;
  }

  PARLAY.forEach(p => {
    const row = document.createElement("div");
    row.className = "parlay-row";
    row.innerHTML = `
      <span>${p.label}</span>
      <button onclick="removeFromParlay('${p.id}')">✕</button>
    `;
    el.appendChild(row);
  });

  updateParlayMath();
}

function updateParlayMath() {
  const stake = Number(document.getElementById("stake")?.value || 0);

  if (!PARLAY.length || !stake) {
    document.getElementById("parlay-math").innerHTML = "";
    return;
  }

  let combinedProb = 1;
  let combinedOdds = 1;

  PARLAY.forEach(p => {
    combinedProb *= p.modelProb;
    combinedOdds *= decimalOdds(p.odds);
  });

  const win = (stake * (combinedOdds - 1)).toFixed(2);
  const ev  = ((combinedProb * combinedOdds) - 1) * 100;

  document.getElementById("parlay-math").innerHTML = `
    <div>To win: $${win}</div>
    <div>Prob: ${formatPct(combinedProb)}</div>
    <div class="${ev > 0 ? "ev-green" : "ev-red"}">EV ${ev.toFixed(1)}%</div>
  `;
}

/******************************************************
 * RENDER MAIN MARKETS
 ******************************************************/

function renderMainMarkets(event) {
  const container = document.createElement("div");
  container.className = "market-row";

  ["h2h", "spreads", "totals"].forEach(type => {
    const market = event.books[type];
    if (!market) return;

    const modeled = modelProbability(
      Object.values(market).map(o => ({
        ...o,
        implied: americanToImplied(o.odds)
      }))
    );

    const box = document.createElement("div");
    box.className = "market-box";
    box.innerHTML = `<h4>${type === "h2h" ? "Moneyline" : type}</h4>`;

    modeled.forEach(o => {
      const ev = expectedValue(o.modelProb, o.odds) * 100;
      const id = `${event.id}-${type}-${o.name}`;

      const row = document.createElement("div");
      row.className = `market-leg ${ev > 0 ? "good" : ""}`;
      row.innerHTML = `
        <strong>${o.name} ${o.odds > 0 ? "+" : ""}${o.odds}</strong>
        <div class="muted">
          Book: ${formatPct(o.implied)} · Model: ${formatPct(o.modelProb)}
        </div>
        <div class="ev-green">EV ${ev.toFixed(1)}%</div>
        <button
          class="parlay-btn"
          onclick='addToParlay({
            id:"${id}",
            label:"${event.away_team} @ ${event.home_team} — ${o.name}",
            odds:${o.odds},
            modelProb:${o.modelProb}
          })'
        >+ Parlay</button>
      `;
      box.appendChild(row);
    });

    container.appendChild(box);
  });

  return container;
}

/******************************************************
 * RENDER PROPS
 ******************************************************/

function renderProps(props, eventId) {
  const panel = document.createElement("div");
  panel.className = "props-panel";

  Object.entries(props).forEach(([category, players]) => {
    const h = document.createElement("h4");
    h.textContent = category;
    panel.appendChild(h);

    players.forEach(p => {
      const item = document.createElement("div");
      item.className = "prop-item";
      item.innerHTML = `<strong>${p.player}</strong>`;

      p.outcomes.forEach(o => {
        const ev = expectedValue(o.modelProb, o.odds) * 100;
        const id = `${eventId}-prop-${p.player}-${o.label}`;

        const row = document.createElement("div");
        row.className = "prop-side";
        row.innerHTML = `
          <span>${o.label} ${o.odds > 0 ? "+" : ""}${o.odds}</span>
          <span class="muted">Book ${formatPct(o.implied)} · Model ${formatPct(o.modelProb)}</span>
          <span class="ev-green">EV ${ev.toFixed(1)}%</span>
          <button
            class="parlay-btn"
            onclick='addToParlay({
              id:"${id}",
              label:"${p.player} ${o.label}",
              odds:${o.odds},
              modelProb:${o.modelProb}
            })'
          >+ Parlay</button>
        `;
        item.appendChild(row);
      });

      panel.appendChild(item);
    });
  });

  return panel;
}

/******************************************************
 * LOAD EVENTS
 ******************************************************/

async function load() {
  const root = document.getElementById("games-container");
  root.innerHTML = "";

  const events = await fetch(API_EVENTS).then(r => r.json());

  for (const ev of events) {
    const card = document.createElement("div");
    card.className = "game-card";

    card.innerHTML = `
      <div class="game-header">
        <strong>${ev.away_team} @ ${ev.home_team}</strong>
        <div class="muted">${new Date(ev.commence_time).toLocaleString()}</div>
      </div>
    `;

    card.appendChild(renderMainMarkets(ev));

    const props = await fetch(`${API_PROPS}?eventId=${ev.id}`).then(r => r.json());
    card.appendChild(renderProps(props, ev.id));

    root.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", load);
