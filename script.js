/* ======================================================
   EmpirePicks — Stable Core Script (Crash-Proof)
   ====================================================== */

const state = {
  parlay: [],
  stake: 10,
  allBets: []
};

/* ------------------ Math ------------------ */

const americanToDecimal = o => o > 0 ? 1 + o / 100 : 1 + 100 / Math.abs(o);
const impliedProb = o => o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
const evPct = (p, o) => ((p * americanToDecimal(o)) - 1) * 100;

const evClass = ev =>
  ev >= 15 ? "ev-elite" :
  ev >= 8  ? "ev-strong" :
  ev >= 3  ? "ev-positive" :
             "ev-neutral";

/* ------------------ Parlay ------------------ */

function addToParlay(bet) {
  if (state.parlay.some(b => b.id === bet.id)) return;
  state.parlay.push(bet);
  renderParlay();
}

function removeFromParlay(id) {
  state.parlay = state.parlay.filter(b => b.id !== id);
  renderParlay();
}

function renderParlay() {
  const el = document.getElementById("parlay-sidebar");
  if (!el) return;

  el.innerHTML = `
    <div class="parlay-header">🏛️ EmpirePicks Parlay</div>
    <div class="parlay-legs">
      ${state.parlay.map(b => `
        <div class="parlay-leg">
          <div>
            <strong>${b.label}</strong>
            <div class="muted">${b.market}</div>
          </div>
          <button onclick="removeFromParlay('${b.id}')">✕</button>
        </div>
      `).join("")}
    </div>
    <div class="parlay-stake">
      <label>Stake</label>
      <input type="number" min="1" value="${state.stake}"
        onchange="state.stake=this.value; renderParlay()" />
    </div>
    ${renderParlayCalc()}
  `;
}

function renderParlayCalc() {
  if (!state.parlay.length) return "";

  const dec = state.parlay.map(b => americanToDecimal(b.odds))
    .reduce((a, b) => a * b, 1);

  const prob = state.parlay.map(b => b.modelProb)
    .reduce((a, b) => a * b, 1);

  return `
    <div class="parlay-summary">
      <div>${state.stake} → <strong>${(state.stake * dec).toFixed(2)}</strong></div>
      <div class="muted">Prob ${(prob * 100).toFixed(1)}%</div>
      <button class="place-bet">Place Bet</button>
    </div>
  `;
}

/* ------------------ Top-3 EV ------------------ */

function renderTopEV() {
  const top = state.allBets
    .filter(b => Number.isFinite(b.ev) && b.ev >= 8)
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

/* ------------------ Rendering ------------------ */

function renderGames(games) {
  const container = document.getElementById("games-container");
  container.innerHTML = "";
  state.allBets = [];

  games.forEach(game => {
    container.insertAdjacentHTML("beforeend", renderGame(game));
  });

  container.insertAdjacentHTML("afterbegin", renderTopEV());
}

function renderGame(game) {
  return `
    <div class="game-card">
      <div class="game-header">
        <strong>${game.away_team}</strong> @ <strong>${game.home_team}</strong>
        <span>${new Date(game.commence_time).toLocaleString()}</span>
      </div>

      <div class="market-grid">
        ${renderMarket(game, "moneyline")}
        ${renderMarket(game, "spread")}
        ${renderMarket(game, "total")}
      </div>

      ${renderProps(game)}
    </div>
  `;
}

function renderMarket(game, type) {
  if (!game.markets || !Array.isArray(game.markets[type])) return "";

  return `
    <div class="market-card">
      <h4>${type.toUpperCase()}</h4>
      ${game.markets[type].map(o => {
        if (!o || !Number.isFinite(o.odds) || !Number.isFinite(o.fair)) return "";

        const ev = evPct(o.fair, o.odds);
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
                Book ${(o.implied * 100).toFixed(1)}% · Model ${(o.fair * 100).toFixed(1)}%
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
  if (!Array.isArray(game.props)) return "";

  return `
    <div class="props-section">
      <h4>Player Props</h4>
      ${game.props.map(p => {
        if (!Number.isFinite(p.odds) || !Number.isFinite(p.fair)) return "";

        const ev = evPct(p.fair, p.odds);
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
                Book ${(p.implied * 100).toFixed(1)}% · Model ${(p.fair * 100).toFixed(1)}%
              </div>
            </div>
            <button onclick='addToParlay(${JSON.stringify(bet)})'>+ Parlay</button>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

/* ------------------ Boot ------------------ */

fetch("/api/events")
  .then(r => r.json())
  .then(renderGames)
  .catch(e => console.error("Render failed", e));
