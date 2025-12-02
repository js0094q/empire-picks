// script.js
// ES6 module — use <script type="module"> in HTML

// UTIL: odds ↔ probability & EV conversions
export function impliedProbability(americanOdds) {
  const odds = Number(americanOdds);
  if (odds > 0) {
    return 100 / (odds + 100);
  }
  const pos = -odds;
  return pos / (pos + 100);
}

export function decimalOdds(americanOdds) {
  const odds = Number(americanOdds);
  if (odds > 0) return (odds / 100) + 1;
  return (100 / (-odds)) + 1;
}

export function expectedValue(myProb, americanOdds, stake = 1) {
  const profit = decimalOdds(americanOdds) * stake - stake;
  return myProb * profit - (1 - myProb) * stake;
}

// Placeholder: your own model. Replace this with real logic/data.
function modelEstimatedProbability(game, outcomeName, marketType) {
  // Example: naive 50/50 for all — replace with model.
  return 0.5;
}

let parlayLegs = [];

// Add a leg to parlay
function addParlayLeg(leg) {
  const key = `${leg.gameId}|${leg.market}|${leg.outcome}`;
  if (parlayLegs.some(l => l.key === key)) return;
  leg.key = key;
  parlayLegs.push(leg);
  renderParlay();
}

// Remove a leg by key
function removeParlayLeg(key) {
  parlayLegs = parlayLegs.filter(l => l.key !== key);
  renderParlay();
}

// Render parlay panel
function renderParlay() {
  const container = document.getElementById("parlay-legs");
  if (!container) return;
  container.innerHTML = "";
  if (parlayLegs.length === 0) {
    container.textContent = "No legs added.";
    return;
  }
  const ul = document.createElement("ul");
  parlayLegs.forEach(leg => {
    const li = document.createElement("li");
    li.textContent = `${leg.away} @ ${leg.home} — ${leg.market}:${leg.outcome} @ ${leg.odds}`;
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.onclick = () => removeParlayLeg(leg.key);
    li.append(" ", btn);
    ul.append(li);
  });
  container.append(ul);
}

// Fetch data safely
async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Network error: ${resp.status}`);
  }
  return resp.json();
}

// Main load & render function
async function loadAndRender() {
  try {
    // Replace with your real endpoints
    const [eventsList, oddsList] = await Promise.all([
      fetchJson("/api/events"),
      fetchJson("/api/odds")
    ]);

    const oddsMap = new Map(oddsList.map(o => [o.id, o]));
    const container = document.getElementById("games-container");
    container.innerHTML = "";

    for (const game of eventsList) {
      const odds = oddsMap.get(game.id);
      if (!odds) continue;

      const home = game.home_team;
      const away = game.away_team;
      const kickoff = new Date(game.commence_time).toLocaleString();

      const card = document.createElement("div");
      card.className = "game-card";

      const teamsDiv = document.createElement("div");
      teamsDiv.className = "teams";
      teamsDiv.innerHTML = `<span>${away}</span><span>${home}</span>`;

      card.append(teamsDiv);

      // We'll render moneyline odds for each bookmaker — pick first for demo
      const bm = odds.bookmakers[0];
      const ml = bm.markets.find(m => m.key === "h2h");
      if (!ml) continue;
      for (const o of ml.outcomes) {
        const oddsVal = o.price;
        const impliedP = impliedProbability(oddsVal);
        const myP = modelEstimatedProbability(game, o.name, "moneyline");
        const ev = expectedValue(myP, oddsVal);

        const lineDiv = document.createElement("div");
        lineDiv.className = "odds-line";
        lineDiv.innerHTML = `
          <span><strong>${o.name} ML ${oddsVal > 0 ? '+' + oddsVal : oddsVal}</strong></span>
          <span>Implied ${(impliedP*100).toFixed(1)}%</span>
          <span>MyP ${(myP*100).toFixed(1)}%</span>
        `;

        if (ev > 0) {
          lineDiv.classList.add("value-bet");
          const badge = document.createElement("span");
          badge.className = "ev-badge";
          badge.textContent = `+EV ${(ev*100).toFixed(1)}%`;
          lineDiv.append(badge);
        }

        const btn = document.createElement("button");
        btn.textContent = "Add to Parlay";
        btn.onclick = () => addParlayLeg({
          gameId: game.id,
          home, away,
          market: "moneyline",
          outcome: o.name,
          odds: oddsVal
        });
        lineDiv.append(" ", btn);

        card.append(lineDiv);
      }

      const kickoffDiv = document.createElement("div");
      kickoffDiv.textContent = `Kickoff: ${kickoff}`;
      card.append(kickoffDiv);

      container.append(card);
    }

    renderParlay();

  } catch (err) {
    console.error("Error loading data:", err);
    const container = document.getElementById("games-container");
    if (container) container.textContent = "Error loading games/odds.";
  }
}

// EV-filter (show only +EV games)
function setupFilterButton() {
  const btn = document.getElementById("filter-ev");
  if (!btn) return;
  btn.onclick = () => {
    document.querySelectorAll(".game-card").forEach(card => {
      const hasEV = card.querySelector(".value-bet");
      card.style.display = hasEV ? "" : "none";
    });
  };
}

// Initialize
document.addEventListener("DOMContentLoaded", () => {
  loadAndRender();
  setupFilterButton();
});
