const API_EVENTS = "/api/events";
const API_PROPS = "/api/props";

let PARLAY = [];

/* ------------------ UTIL ------------------ */

const americanToImplied = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const decOdds = o => (o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o));

const pct = x => (x * 100).toFixed(1) + "%";

/* ------------------ MODEL ------------------ */
/*
Model probability = no-vig normalized consensus

Steps:
1. Convert odds → implied
2. Sum implied
3. Normalize so outcomes sum to 1
*/

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

    const row = document.createElement("div");
    row.className = "parlay-row";
    row.innerHTML = `
      <span>${p.label}</span>
      <button onclick="removeFromParlay('${p.id}')">✕</button>
    `;
    box.appendChild(row);
  });

  const win = (stake * (odds - 1)).toFixed(2);
  const ev = ((prob * odds) - 1) * 100;

  math.innerHTML = `
    <div>To win: $${win}</div>
    <div>Prob: ${pct(prob)}</div>
    <div class="${ev > 0 ? "ev-green" : "ev-red"}">EV ${ev.toFixed(1)}%</div>
  `;
}

/* ------------------ MARKETS ------------------ */

function renderMarkets(ev) {
  const row = document.createElement("div");
  row.className = "market-row";

  ["h2h", "spreads", "totals"].forEach(type => {
    const market = ev.books[type];
    if (!market) return;

    const modeled = normalize(
      Object.values(market).map(o => ({
        ...o,
        implied: americanToImplied(o.odds)
      }))
    );

    const box = document.createElement("div");
    box.className = "market-box";
    box.innerHTML = `<h4>${type === "h2h" ? "Moneyline" : type}</h4>`;

    modeled.forEach(o => {
      const evp = EV(o.modelProb, o.odds);
      const id = `${ev.id}-${type}-${o.name}`;

      const leg = document.createElement("div");
      leg.className = "market-leg";
      leg.innerHTML = `
        <strong>${o.name} ${o.odds > 0 ? "+" : ""}${o.odds}</strong>
        <div class="muted">
          Book ${pct(o.implied)} · Model ${pct(o.modelProb)}
        </div>
        <div class="ev-green">EV ${evp.toFixed(1)}%</div>
        <button class="parlay-btn"
          onclick='addToParlay({
            id:"${id}",
            label:"${ev.away_team} @ ${ev.home_team} — ${o.name}",
            odds:${o.odds},
            modelProb:${o.modelProb}
          })'>+ Parlay</button>
      `;
      box.appendChild(leg);
    });

    row.appendChild(box);
  });

  return row;
}

/* ------------------ PROPS (FIXED) ------------------ */

function renderProps(props, eventId) {
  const panel = document.createElement("div");
  panel.className = "props-panel";

  Object.entries(props).forEach(([category, players]) => {
    const h = document.createElement("h4");
    h.textContent = category;
    panel.appendChild(h);

    // players is OBJECT, not array
    Object.entries(players).forEach(([player, data]) => {
      const item = document.createElement("div");
      item.className = "prop-item";
      item.innerHTML = `<strong>${player}</strong>`;

      const modeled = normalize(
        data.outcomes.map(o => ({
          ...o,
          implied: americanToImplied(o.odds)
        }))
      );

      modeled.forEach(o => {
        const evp = EV(o.modelProb, o.odds);
        const id = `${eventId}-prop-${player}-${o.label}`;

        const row = document.createElement("div");
        row.className = "prop-side";
        row.innerHTML = `
          <span>${o.label} ${o.odds > 0 ? "+" : ""}${o.odds}</span>
          <span class="muted">Book ${pct(o.implied)} · Model ${pct(o.modelProb)}</span>
          <span class="ev-green">EV ${evp.toFixed(1)}%</span>
          <button class="parlay-btn"
            onclick='addToParlay({
              id:"${id}",
              label:"${player} ${o.label}",
              odds:${o.odds},
              modelProb:${o.modelProb}
            })'>+ Parlay</button>
        `;
        item.appendChild(row);
      });

      panel.appendChild(item);
    });
  });

  return panel;
}

/* ------------------ LOAD ------------------ */

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

    card.appendChild(renderMarkets(ev));

    try {
      const props = await fetch(`${API_PROPS}?eventId=${ev.id}`).then(r => r.json());
      card.appendChild(renderProps(props, ev.id));
    } catch {
      /* props optional */
    }

    root.appendChild(card);
  }
}

document.addEventListener("DOMContentLoaded", load);
