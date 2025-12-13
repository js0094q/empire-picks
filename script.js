// ===============================
// EmpirePicks — Stable Core Script
// Markets only: ML / Spread / Total
// ===============================

const API_EVENTS = "/api/events";
const container = document.getElementById("games-container");

// -------------------------------
// Helpers
// -------------------------------

// Convert American odds to implied probability
function impliedProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

// Convert American odds to decimal odds
function decimalOdds(odds) {
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

// No-vig normalization (two-outcome markets)
function noVig(p1, p2) {
  const total = p1 + p2;
  return [p1 / total, p2 / total];
}

// EV calculation
function expectedValue(odds, modelProb) {
  return modelProb * decimalOdds(odds) - 1;
}

// EV color class
function evClass(ev) {
  if (ev >= 0.05) return "ev-good";
  if (ev <= -0.05) return "ev-bad";
  return "ev-neutral";
}

// -------------------------------
// Rendering
// -------------------------------

function renderMarket(title, outcomes) {
  const market = document.createElement("div");
  market.className = "market";

  const header = document.createElement("h4");
  header.textContent = title;
  market.appendChild(header);

  outcomes.forEach(o => {
    const row = document.createElement("div");
    row.className = `market-row ${evClass(o.ev)}`;

    row.innerHTML = `
      <div class="market-name">${o.name} ${o.odds > 0 ? "+" : ""}${o.odds}</div>
      <div class="market-probs">
        Book: ${(o.bookProb * 100).toFixed(1)}%
        · Model: ${(o.modelProb * 100).toFixed(1)}%
      </div>
      <div class="market-ev">
        EV ${(o.ev * 100).toFixed(1)}%
      </div>
    `;

    market.appendChild(row);
  });

  return market;
}

function renderGame(game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const header = document.createElement("div");
  header.className = "game-header";
  header.innerHTML = `
    <h3>${game.away_team} @ ${game.home_team}</h3>
    <div class="game-time">${new Date(game.commence_time).toLocaleString()}</div>
  `;
  card.appendChild(header);

  // -------------------------------
  // Moneyline
  // -------------------------------
  if (game.books?.h2h?.length) {
    const m = game.books.h2h[0];
    const p1 = impliedProb(m.outcome1.odds);
    const p2 = impliedProb(m.outcome2.odds);
    const [mp1, mp2] = noVig(p1, p2);

    card.appendChild(
      renderMarket("Moneyline", [
        {
          name: m.outcome1.name,
          odds: m.outcome1.odds,
          bookProb: p1,
          modelProb: mp1,
          ev: expectedValue(m.outcome1.odds, mp1)
        },
        {
          name: m.outcome2.name,
          odds: m.outcome2.odds,
          bookProb: p2,
          modelProb: mp2,
          ev: expectedValue(m.outcome2.odds, mp2)
        }
      ])
    );
  }

  // -------------------------------
  // Spread
  // -------------------------------
  if (game.books?.spreads?.length) {
    const m = game.books.spreads[0];
    const p1 = impliedProb(m.outcome1.odds);
    const p2 = impliedProb(m.outcome2.odds);
    const [mp1, mp2] = noVig(p1, p2);

    card.appendChild(
      renderMarket("Spread", [
        {
          name: `${m.outcome1.name} ${m.outcome1.point}`,
          odds: m.outcome1.odds,
          bookProb: p1,
          modelProb: mp1,
          ev: expectedValue(m.outcome1.odds, mp1)
        },
        {
          name: `${m.outcome2.name} ${m.outcome2.point}`,
          odds: m.outcome2.odds,
          bookProb: p2,
          modelProb: mp2,
          ev: expectedValue(m.outcome2.odds, mp2)
        }
      ])
    );
  }

  // -------------------------------
  // Totals
  // -------------------------------
  if (game.books?.totals?.length) {
    const m = game.books.totals[0];
    const p1 = impliedProb(m.over.odds);
    const p2 = impliedProb(m.under.odds);
    const [mp1, mp2] = noVig(p1, p2);

    card.appendChild(
      renderMarket("Total", [
        {
          name: `Over ${m.point}`,
          odds: m.over.odds,
          bookProb: p1,
          modelProb: mp1,
          ev: expectedValue(m.over.odds, mp1)
        },
        {
          name: `Under ${m.point}`,
          odds: m.under.odds,
          bookProb: p2,
          modelProb: mp2,
          ev: expectedValue(m.under.odds, mp2)
        }
      ])
    );
  }

  return card;
}

// -------------------------------
// Load Events
// -------------------------------

async function loadGames() {
  container.innerHTML = "Loading games…";

  try {
    const res = await fetch(API_EVENTS);
    const games = await res.json();

    container.innerHTML = "";
    games.forEach(g => container.appendChild(renderGame(g)));
  } catch (err) {
    console.error(err);
    container.innerHTML = "Failed to load games.";
  }
}

loadGames();
