// ===============================================
//  EMPIREPICKS — FRONTEND SPORTSBOOK UI
// ===============================================

document.addEventListener("DOMContentLoaded", loadGames);

// Load all games with EV, props, parlays
async function loadGames() {
  const container = document.getElementById("games");
  container.innerHTML = `<div class="loading">Loading games...</div>`;

  try {
    const r = await fetch("/api/events");
    const games = await r.json();

    container.innerHTML = "";
    games.sort((a, b) => b.bestEV - a.bestEV);

    for (const ev of games) renderGameCard(ev, container);

  } catch (e) {
    console.error(e);
    container.innerHTML = `<div class="error">Failed to load.</div>`;
  }
}

// Build game card
function renderGameCard(ev, container) {
  const kickoff = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  });

  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        ${ev.away_team} @ ${ev.home_team}
        <span class="ev-badge">Top EV: ${(ev.bestEV * 100).toFixed(1)}%</span>
      </div>
      <div>Kickoff (EST): ${kickoff}</div>
    </div>

    <div id="odds-${ev.id}"></div>
    <div id="parlay-${ev.id}" class="parlay-ev-box"></div>
    <div id="props-${ev.id}"></div>
  `;

  container.appendChild(card);
  renderMainMarkets(ev);
  highlightBestEV(ev);
  renderParlayEV(ev);
  renderPropsEV(ev);
}

// MAIN MARKETS
function renderMainMarkets(ev) {
  const box = document.getElementById(`odds-${ev.id}`);
  const b = ev.bestLines;

  box.innerHTML = `
    <div class="market-header">Moneyline</div>
    <div>
      <span class="odds-pill" data-ev="${ev.ev.awayML}">
        ${ev.away_team}: ${b.moneyline.away?.price ?? "-"}
      </span>
      <span class="odds-pill" data-ev="${ev.ev.homeML}">
        ${ev.home_team}: ${b.moneyline.home?.price ?? "-"}
      </span>
    </div>

    <div class="market-header">Spreads</div>
    <div>
      <span class="odds-pill">${b.spreads.away?.point} ${b.spreads.away?.price}</span>
      <span class="odds-pill">${b.spreads.home?.point} ${b.spreads.home?.price}</span>
    </div>

    <div class="market-header">Totals</div>
    <div>
      <span class="odds-pill">Over ${b.totals.over?.point} (${b.totals.over?.price})</span>
      <span class="odds-pill">Under ${b.totals.under?.point} (${b.totals.under?.price})</span>
    </div>
  `;
}

// Highlight highest EV pick
function highlightBestEV(ev) {
  const pills = document.querySelectorAll(`#odds-${ev.id} .odds-pill`);
  const best = ev.bestEV;

  pills.forEach(p => {
    const val = Number(p.dataset.ev);
    if (Math.abs(val - best) < 0.0001) {
      p.classList.add("ev-highlight");
    }
  });
}

// Parlay EV UI
function renderParlayEV(ev) {
  const box = document.getElementById(`parlay-${ev.id}`);
  const P = ev.bestParlays;

  if (!P || P.length === 0) {
    box.innerHTML = `<em>No +EV parlays detected.</em>`;
    return;
  }

  let html = `<div class="market-header">Best Parlay Opportunities</div>`;

  P.forEach(p => {
    html += `
      <div style="margin-bottom:10px;">
        <strong style="color:var(--green);">Edge: ${(p.edge * 100).toFixed(2)}%</strong><br>
        True: ${(p.trueProb * 100).toFixed(1)}% — Implied: ${(p.impliedProb * 100).toFixed(1)}%<br>
        Legs:<br>
        • ${p.legs[0].name ?? p.legs[0].team} (${p.legs[0].price})<br>
        • ${p.legs[1].name ?? p.legs[1].team} (${p.legs[1].price})
      </div>
    `;
  });

  box.innerHTML = html;
}

// Props EV UI
function renderPropsEV(ev) {
  const box = document.getElementById(`props-${ev.id}`);
  const props = ev.propsEV;

  if (!props || props.length === 0) {
    box.innerHTML = `<em>No props available.</em>`;
    return;
  }

  let html = `<div class="market-header">Top Prop Value</div>`;

  props.slice(0, 6).forEach(p => {
    const glow = p.bestEV > 0 ? "ev-positive" : "";

    html += `
      <div class="prop-card ${glow}">
        <div class="prop-title">${p.player} — ${p.type.replace("player_", "")}</div>
        Line: ${p.point}<br>
        Best Side: <strong>${p.bestSide}</strong><br>
        EV: ${(p.bestEV * 100).toFixed(1)}%
      </div>
    `;
  });

  box.innerHTML = html;
}
