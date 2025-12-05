// ===========================
// EmpirePicks DK Odds Engine
// ===========================

// Pull all events
document.addEventListener("DOMContentLoaded", loadGames);

async function loadGames() {
  const container = document.getElementById("games-container");
  container.innerHTML = `<div class="loader">Loading games...</div>`;

  try {
    const r = await fetch("/api/events");
    const games = await r.json();

    container.innerHTML = "";
    games.forEach(g => renderGameCard(g, container));

  } catch (err) {
    container.innerHTML = `<div class="error">Failed loading games.</div>`;
  }
}


// ===========================
// Game Card Builder
// ===========================
async function renderGameCard(ev, parent) {
  const card = document.createElement("div");
  card.className = "game-card";

  // Get odds
  const oddsRes = await fetch(`/api/odds?eventId=${ev.id}`);
  const data = await oddsRes.json();
  const game = data[0];

  if (!game) {
    card.innerHTML = `<div class="error">No odds yet</div>`;
    parent.appendChild(card);
    return;
  }

  const ana = analyzeGame(game, ev.away_team, ev.home_team);
  const line = computeAggregateOdds(game, ev.away_team, ev.home_team, ana);

  const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  });

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">${ev.away_team} @ ${ev.home_team}</div>
      <div class="kickoff">Kickoff: ${kickoffLocal}</div>
    </div>

    ${renderAggregateRow(line)}

    <div class="model-pick">
      Model Pick: <span class="pick-team">${ana.winner}</span>
      <span class="pick-prob">${(ana.winnerProb * 100).toFixed(1)}%</span>
    </div>
  `;

  parent.appendChild(card);
}


// ===========================
// Aggregate Odds Row (Display)
// ===========================
function renderAggregateRow(l) {
  return `
    <div class="betting-row">

      <div class="bet-block">
        <div class="bet-label">Spread</div>
        <div class="bet-value">${l.spreadTeam} ${l.spread} (${money(l.spreadOdds)})</div>
      </div>

      <div class="bet-block">
        <div class="bet-label">Moneyline</div>
        <div class="bet-value">${l.mlTeam} ${money(l.ml)}</div>
      </div>

      <div class="bet-block">
        <div class="bet-label">Total</div>
        <div class="bet-value">O${l.total} / U${l.total}</div>
      </div>

      <div class="bet-block best-ev">
        <div class="bet-label">Best EV</div>
        <div class="bet-value">${l.bestEV.team} ${money(l.bestEV.odds)}</div>
        <div class="bet-ev">+${(l.bestEV.edge * 100).toFixed(1)}%</div>
      </div>

    </div>
  `;
}


// ===========================
// Aggregate Engine
// ===========================
function computeAggregateOdds(game, away, home, ana) {
  const ml = [];
  const spreads = [];
  const totals = [];
  let bestEV = { edge: -999 };

  game.bookmakers.forEach(bm => {
    bm.markets.forEach(m => {

      // --- MONEYLINE ---
      if (m.key === "h2h") {
        m.outcomes.forEach(o => {
          if (o.name === away || o.name === home) ml.push(o.price);

          // EV
          const implied = prob(o.price);
          const fv = o.name === away ? ana.nvA : ana.nvH;
          const edge = fv - implied;

          if (edge > bestEV.edge) {
            bestEV = { team: o.name, odds: o.price, edge };
          }
        });
      }

      // --- SPREAD ---
      if (m.key === "spreads") {
        m.outcomes.forEach(o => spreads.push(o));
      }

      // --- TOTALS ---
      if (m.key === "totals") {
        m.outcomes.forEach(o => totals.push(o));
      }

    });
  });

  const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length || 0;

  const mlTeam = ana.nvA > ana.nvH ? away : home;
  const avgML = avg(ml);

  const bestSpread = spreads.sort((a,b)=>Math.abs(a.point)-Math.abs(b.point))[0] || {name: mlTeam, point: 0, price: 0};
  const total = totals[0]?.point || 0;

  return {
    mlTeam,
    ml: avgML,
    spreadTeam: bestSpread.name,
    spread: bestSpread.point,
    spreadOdds: bestSpread.price,
    total,
    bestEV
  };
}


// ===========================
// Game Analysis
// ===========================
function analyzeGame(game, away, home) {
  let aOdds = [], hOdds = [];

  game.bookmakers.forEach(bm => {
    const h2h = bm.markets.find(m => m.key === "h2h");
    if (!h2h) return;

    h2h.outcomes.forEach(o => {
      if (o.name === away) aOdds.push(prob(o.price));
      if (o.name === home) hOdds.push(prob(o.price));
    });
  });

  const avg = arr => arr.reduce((a,b)=>a+b,0)/arr.length || 0;

  const pA = avg(aOdds);
  const pH = avg(hOdds);

  const nvA = pA / (pA + pH);
  const nvH = pH / (pA + pH);

  const winner = nvA > nvH ? away : home;

  return {
    nvA,
    nvH,
    winner,
    winnerProb: Math.max(nvA, nvH)
  };
}


// ===========================
// Helpers
// ===========================
function prob(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function money(v) {
  return v > 0 ? `+${v}` : `${v}`;
}
