const API_EVENTS = "/api/events";
const API_PROPS = "/api/props";

let PARLAY = [];
let ALL_CANDIDATES = [];

/* ------------------ UTIL ------------------ */

const americanToImplied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const decOdds = o => (o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o));
const pct = x => (x * 100).toFixed(1) + "%";

/* ------------------ MODEL ------------------ */

function normalize(outcomes) {
  const sum = outcomes.reduce((s, o) => s + o.implied, 0);
  return outcomes.map(o => ({
    ...o,
    modelProb: o.implied / sum
  }));
}

const EV = (p, odds) => (p * decOdds(odds) - 1) * 100;

/* ------------------ PARLAY ------------------ */

function addToParlay(leg) {
  if (PARLAY.some(p => p.id === leg.id)) return;
  PARLAY.push(leg);
  renderParlay();
}

function removeFromParlay(id) {
  PARLAY = PARLAY.filter(p => p.id !== id);
  renderParlay();
}

function renderParlay() {
  const box = document.getElementById("parlay-items");
  const stake = +document.getElementById("stake")?.value || 0;
  const math = document.getElementById("parlay-math");

  if (!box) return;
  box.innerHTML = "";

  if (!PARLAY.length) {
    math.innerHTML = "";
    return;
  }

  let prob = 1;
  let odds = 1;

  PARLAY.forEach(p => {
    prob *= p.modelProb;
    odds *= decOdds(p.odds);

    box.innerHTML += `
      <div class="parlay-row">
        <span>${p.label}</span>
        <button onclick="removeFromParlay('${p.id}')">✕</button>
      </div>
    `;
  });

  const win = (stake * (odds - 1)).toFixed(2);
  const ev = ((prob * odds) - 1) * 100;

  math.innerHTML = `
    <div>To win: $${win}</div>
    <div>Prob: ${pct(prob)}</div>
    <div class="${ev > 0 ? "ev-green" : "ev-red"}">EV ${ev.toFixed(1)}%</div>
  `;
}

/* ------------------ MARKET AGGREGATION ------------------ */

function aggregateMarket(books, key) {
  const map = {};

  books.forEach(b => {
    const o1 = b.outcome1;
    const o2 = b.outcome2;

    if (!map[o1.name]) map[o1.name] = [];
    if (!map[o2.name]) map[o2.name] = [];

    map[o1.name].push(o1.odds);
    map[o2.name].push(o2.odds);
  });

  return Object.entries(map).map(([name, oddsList]) => {
    const implied = oddsList
      .map(americanToImplied)
      .reduce((a, b) => a + b, 0) / oddsList.length;

    const bestOdds =
      oddsList.reduce((a, b) =>
        decOdds(b) > decOdds(a) ? b : a
      );

    return { name, odds: bestOdds, implied };
  });
}

/* ------------------ RENDER MARKETS ------------------ */

function renderMarkets(ev) {
  const row = document.createElement("div");
  row.className = "market-row";

  ["h2h", "spreads", "totals"].forEach(type => {
    if (!ev.books[type]) return;

    const aggregated = aggregateMarket(ev.books[type], type);
    const modeled = normalize(aggregated);

    const box = document.createElement("div");
    box.className = "market-box";
    box.innerHTML = `<h4>${type === "h2h" ? "Moneyline" : type}</h4>`;

    modeled.forEach(o => {
      const evp = EV(o.modelProb, o.odds);
      const id = `${ev.id}-${type}-${o.name}`;

      ALL_CANDIDATES.push({
        id,
        label: `${ev.away_team} @ ${ev.home_team} — ${o.name}`,
        odds: o.odds,
        modelProb: o.modelProb,
        ev: evp,
        eventId: ev.id
      });

      box.innerHTML += `
        <div class="market-leg">
          <strong>${o.name} ${o.odds > 0 ? "+" : ""}${o.odds}</strong>
          <div class="muted">
            Book ${pct(o.implied)} · Model ${pct(o.modelProb)}
          </div>
          <div class="ev-green">EV ${evp.toFixed(1)}%</div>
          <button class="parlay-btn"
            onclick='addToParlay(${JSON.stringify({
              id,
              label: `${ev.away_team} @ ${ev.home_team} — ${o.name}`,
              odds: o.odds,
              modelProb: o.modelProb
            })})'>+ Parlay</button>
        </div>
      `;
    });

    row.appendChild(box);
  });

  return row;
}

/* ------------------ LOAD ------------------ */

async function load() {
  ALL_CANDIDATES = [];
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

    card.appendChild(renderMarkets(ev));
    root.appendChild(card);
  }

  renderTopEVBanner();
}

document.addEventListener("DOMContentLoaded", load);
