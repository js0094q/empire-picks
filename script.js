// =============================================================
// EMPIREPICKS — NFL ODDS AGGREGATOR (Minimalist + Team Styling)
// =============================================================

document.addEventListener("DOMContentLoaded", loadNFL);

async function loadNFL() {
  const container = document.getElementById("events-container");
  container.innerHTML = `<div class="loader">Loading NFL games...</div>`;

  try {
    // 1. Fetch events
    const eventsRes = await fetch("/api/events");
    const events = await eventsRes.json();

    container.innerHTML = "";

    // 2. Render each event
    for (const ev of events) {
      const oddsRes = await fetch(`/api/odds?eventId=${ev.id}`);
      const data = await oddsRes.json();
      const game = data[0];

      const card = renderGameCard(ev, game);
      applyTeamStyles(card, ev);  // NEW
      container.appendChild(card);
    }

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error">Failed to load NFL games.</div>`;
  }
}

// =============================================================
// GAME CARD RENDERING
// =============================================================

function renderGameCard(ev, game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const away = TeamAssets.get(ev.away_team);
  const home = TeamAssets.get(ev.home_team);

  const ana = analyzeGame(game, ev.away_team, ev.home_team);
  const agg = computeAggregateOdds(game, ev.away_team, ev.home_team, ana);

  const kickoff = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    weekday: "short"
  });

  card.innerHTML = `
    <div class="game-header">
      <img class="team-logo" src="${away.helmetUrl}" alt="${ev.away_team} helmet" />

      <div class="teams">
        ${ev.away_team}
        <span style="margin:0 6px; color:var(--muted);">@</span>
        ${ev.home_team}
      </div>

      <img class="team-logo" src="${home.helmetUrl}" alt="${ev.home_team} helmet" />

      <div class="kickoff">${kickoff}</div>
    </div>

    <div class="betting-row">
      <div class="bet-block">
        <div class="bet-label">Spread</div>
        <div class="bet-value">${agg.spreadTeam === ev.away_team ? agg.spread : -agg.spread}</div>
      </div>

      <div class="bet-block">
        <div class="bet-label">Moneyline</div>
        <div class="bet-value">${fmtOdds(agg.ml)}</div>
      </div>

      <div class="bet-block">
        <div class="bet-label">Total</div>
        <div class="bet-value">${agg.total}</div>
      </div>

      <div class="bet-block best-ev">
        <div class="bet-label">Best EV</div>
        <div class="bet-value">${agg.bestEV.team}</div>
        <div class="bet-ev">${(agg.bestEV.edge * 100).toFixed(1)}%</div>
      </div>
    </div>

    <div class="model-pick">
      Consensus Pick:
      <span class="pick-team">${ana.winner}</span>
      <span class="pick-prob">${(ana.winnerProb * 100).toFixed(1)}%</span>
    </div>
  `;

  return card;
}

// =============================================================
// TEAM STYLING — gradient + helmets (NEW)
// =============================================================

function applyTeamStyles(card, ev) {
  const home = TeamAssets.get(ev.home_team);
  const away = TeamAssets.get(ev.away_team);

  // Choose home team for gradient base (cleaner UX)
  const primary = home.primary;
  const secondary = home.secondary;

  // Inject CSS variables
  card.style.setProperty("--team-primary", primary);
  card.style.setProperty("--team-secondary", secondary);

  // Gradient background
  card.style.background = `linear-gradient(135deg, ${primary}15, ${secondary}15)`;

  // Left border accent
  card.style.borderLeft = `4px solid ${primary}`;
}

// =============================================================
// ANALYZE GAME — MONEYLINE PROBABILITIES
// =============================================================

function analyzeGame(game, away, home) {
  if (!game || !game.bookmakers) {
    return { nvA: 0.5, nvH: 0.5, winner: home, winnerProb: 0.5 };
  }

  let arrA = [];
  let arrH = [];

  game.bookmakers.forEach(bm => {
    const m = bm.markets?.find(x => x.key === "h2h");
    if (!m || !m.outcomes) return;

    const a = m.outcomes.find(o => o.name === away);
    const h = m.outcomes.find(o => o.name === home);

    if (a?.price !== undefined) arrA.push(implied(a.price));
    if (h?.price !== undefined) arrH.push(implied(h.price));
  });

  const avg = arr => arr.length ? arr.reduce((x,y)=>x+y,0)/arr.length : 0.5;

  const pA = avg(arrA);
  const pH = avg(arrH);

  const nvA = pA / (pA + pH);
  const nvH = pH / (pA + pH);

  return {
    nvA,
    nvH,
    winner: nvA > nvH ? away : home,
    winnerProb: Math.max(nvA, nvH)
  };
}

// =============================================================
// AGGREGATE ODDS — Spread, ML, Total, Best EV
// =============================================================

function computeAggregateOdds(game, away, home, ana) {
  let mls = [];
  let spreads = [];
  let totals = [];
  let bestEV = { team: null, odds: null, edge: -999 };

  if (!game || !game.bookmakers) {
    return {
      ml: 0,
      spreadTeam: home,
      spread: 0,
      total: 0,
      bestEV
    };
  }

  game.bookmakers.forEach(bm => {
    bm.markets?.forEach(m => {

      // Moneyline
      if (m.key === "h2h") {
        m.outcomes?.forEach(o => {
          if (typeof o.price === "number") mls.push(o.price);

          const imp = implied(o.price || 0);
          const fair = o.name === away ? ana.nvA : ana.nvH;
          const edge = fair - imp;

          if (edge > bestEV.edge) {
            bestEV = { team: o.name, odds: o.price, edge };
          }
        });
      }

      // Spread
      if (m.key === "spreads") {
        m.outcomes?.forEach(o => spreads.push(o));
      }

      // Total
      if (m.key === "totals") {
        m.outcomes?.forEach(o => totals.push(o));
      }
    });
  });

  const avg = arr => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
  const mlAvg = avg(mls);

  const bestSpread =
    spreads.length
      ? spreads.sort((a,b)=>Math.abs(a.point)-Math.abs(b.point))[0]
      : { name: home, point: 0 };

  const totalAvg =
    totals.length
      ? totals.sort((a,b)=>Math.abs(a.point)-Math.abs(b.point))[0].point
      : 0;

  return {
    mlTeam: ana.nvA > ana.nvH ? away : home,
    ml: mlAvg,
    spreadTeam: bestSpread.name,
    spread: bestSpread.point,
    total: totalAvg,
    bestEV
  };
}

// =============================================================
// HELPERS
// =============================================================

function implied(odds) {
  if (odds > 0) return 100/(odds+100);
  return -odds/(-odds+100);
}

function fmtOdds(o) {
  if (!o || isNaN(o)) return "-";
  return o > 0 ? "+" + o : o;
}
