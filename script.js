/* ================================
   EmpirePicks — Core Script
   ================================ */

const state = {
  parlay: [],
  stake: 10,
  allBets: []
};

/* ---------- Math helpers ---------- */

function americanToDecimal(odds) {
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function impliedProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function evPercent(modelProb, odds) {
  return ((modelProb * americanToDecimal(odds)) - 1) * 100;
}

/* ---------- UI helpers ---------- */

function evClass(ev) {
  if (ev >= 15) return "ev-elite";
  if (ev >= 8) return "ev-strong";
  if (ev >= 3) return "ev-positive";
  return "ev-neutral";
}

/* ---------- Parlay ---------- */

function addToParlay(bet) {
  if (state.parlay.find(p => p.id === bet.id)) return;
  state.parlay.push(bet);
  renderParlay();
}

function removeFromParlay(id) {
  state.parlay = state.parlay.filter(p => p.id !== id);
  renderParlay();
}

function renderParlay() {
  const el = document.getElementById("parlay-sidebar");
  if (!el) return;

  el.innerHTML = `
    <div class="parlay-header">
      <span>🏛️ EmpirePicks Parlay</span>
    </div>
    <div class="parlay-legs">
      ${state.parlay.map(p => `
        <div class="parlay-leg">
          <div>
            <strong>${p.label}</strong>
            <div class="muted">${p.market}</div>
          </div>
          <button onclick="removeFromParlay('${p.id}')">✕</button>
        </div>
      `).join("")}
    </div>
    <div class="parlay-stake">
      <label>Stake</label>
      <input type="number" value="${state.stake}" min="1"
        onchange="state.stake=this.value; renderParlay()" />
    </div>
    ${renderParlayCalc()}
  `;
}

function renderParlayCalc() {
  if (!state.parlay.length) return "";

  const decimalOdds = state.parlay
    .map(p => americanToDecimal(p.odds))
    .reduce((a, b) => a * b, 1);

  const payout = (state.stake * decimalOdds).toFixed(2);
  const prob = state.parlay
    .map(p => p.modelProb)
    .reduce((a, b) => a * b, 1);

  return `
    <div class="parlay-summary">
      <div>${state.stake} → <strong>${payout}</strong></div>
      <div class="muted">Prob ${(prob * 100).toFixed(1)}%</div>
      <button class="place-bet">Place Bet</button>
    </div>
  `;
}

/* ---------- Top-3 EV Banner ---------- */

function renderTopEV() {
  const top = [...state.allBets]
    .filter(b => b.ev >= 8)
    .sort((a, b) => b.ev - a.ev)
    .slice(0, 3);

  if (!top.length) return "";

  return `
    <div class="top-ev-banner">
      ${top.map(b => `
        <div class="top-ev-card">
          <div>${b.label}</div>
          <strong>EV ${b.ev.toFixed(1)}%</strong>
        </div>
      `).join("")}
    </div>
  `;
}

/* ---------- Rendering ---------- */

function renderGames(games) {
  const container = document.getElementById("games-container");
  container.innerHTML = "";

  state.allBets = [];

  container.insertAdjacentHTML("afterbegin", renderTopEV());

  games.forEach(game => {
    container.insertAdjacentHTML("beforeend", renderGame(game));
  });
}

function renderGame(game) {
  return `
    <div class="game-card">
      <div class="game-header">
        <img src="${game.away_logo}">
        <span>@</span>
        <img src="${game.home_logo}">
        <span>${new Date(game.commence_time).toLocaleString()}</span>
      </div>

      <div class="market-grid">
        ${["moneyline","spread","total"].map(m =>
          renderMarket(game, m)
        ).join("")}
      </div>

      ${renderProps(game)}
    </div>
  `;
}

function renderMarket(game, type) {
  if (!game.markets[type]) return "";

  return `
    <div class="market-card">
      <h4>${type.toUpperCase()}</h4>
      ${game.markets[type].map(o => {
        const ev = evPercent(o.fair, o.odds);
        const bet = {
          id: o.id,
          label: `${o.name} ${o.odds}`,
          market: type,
          odds: o.odds,
          modelProb: o.fair,
          ev
        };
        state.allBets.push(bet);

        return `
          <div class="bet-row ${evClass(ev)}">
            <div>
              <strong>${o.name} ${o.odds}</strong>
              <div class="muted">
                Book ${(o.implied*100).toFixed(1)}% · Model ${(o.fair*100).toFixed(1)}%
              </div>
            </div>
            <button onclick='addToParlay(${JSON.stringify(bet)})'>+ Parlay</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function renderProps(game) {
  if (!game.props) return "";

  return `
    <div class="props-section">
      <h4>Player Props</h4>
      ${game.props.map(p => {
        const ev = evPercent(p.fair, p.odds);
        const bet = {
          id: p.id,
          label: `${p.player} ${p.line}`,
          market: p.market,
          odds: p.odds,
          modelProb: p.fair,
          ev
        };
        state.allBets.push(bet);

        return `
          <div class="prop-row ${evClass(ev)}">
            <div>
              <strong>${p.player}</strong> ${p.line}
              <div class="muted">
                Book ${(p.implied*100).toFixed(1)}% · Model ${(p.fair*100).toFixed(1)}%
              </div>
            </div>
            <button onclick='addToParlay(${JSON.stringify(bet)})'>+ Parlay</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* ---------- Boot ---------- */

fetch("/api/events")
  .then(r => r.json())
  .then(renderGames);
