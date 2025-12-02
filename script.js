// ============================================================
// GLOBAL PARLAY FALLBACK (safe to leave at top)
// ============================================================
if (typeof window.addParlayLeg !== "function") {
  window.addParlayLeg = function fallbackAddLeg(leg) {
    console.warn("Parlay system not initialized yet. Queued leg:", leg);
    window._pendingParlayLegs = window._pendingParlayLegs || [];
    window._pendingParlayLegs.push(leg);
  };
}

// ============================================================
// Utility Functions
// ============================================================
// Countdown
const countdown = getCountdownString(ev.commence_time);

// FIXED EST kickoff time
const kickoffLocal = getKickoffEST(ev.commence_time);

const card = document.createElement("div");
card.className = "game-card";

card.innerHTML = `
  <div class="game-header">
      <div class="teams">${ev.away_team} @ ${ev.home_team}</div>
      <div class="kickoff">Kickoff (EST): ${kickoffLocal}</div>
      <div class="countdown">⏳ ${countdown}</div>
  </div>
`;
// Convert American odds to implied probability
function impliedProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

// Countdown display
function getCountdownString(utc) {
  const kickoff = new Date(utc);
  const now = new Date();
  const diff = kickoff - now;

  if (diff <= 0) return "LIVE";

  const hrs = Math.floor(diff / 1000 / 60 / 60);
  const mins = Math.floor((diff / 1000 / 60) % 60);
  return `${hrs}h ${mins}m`;
}

// Pick the best odds across books for each market
function getBestOdds(bookmakers, marketKey, outcomeName) {
  let best = null;
  for (const b of bookmakers) {
    const m = b.markets.find(m => m.key === marketKey);
    if (!m) continue;

    const o = m.outcomes.find(o => o.name === outcomeName);
    if (!o) continue;

    if (!best || o.price > best.price) {
      best = { ...o, book: b.key };
    }
  }
  return best;
}

// ============================================================
// Fetch Games + Render Cards
// ============================================================

async function loadGames() {
  const container = document.getElementById("games");
  if (!container) return;

  container.innerHTML = `<div class="loading">Loading games...</div>`;

  try {
    const res = await fetch("/api/events");
    const events = await res.json();

    if (!Array.isArray(events) || events.length === 0) {
      container.innerHTML = `<div class="error">No games available</div>`;
      return;
    }

    // Sort by date
    events.sort(
      (a, b) => new Date(a.commence_time) - new Date(b.commence_time)
    );

    container.innerHTML = "";

    for (const ev of events) {
      renderGameCard(ev, container);
    }
  } catch (err) {
    console.error("Game load failed:", err);
    container.innerHTML = `<div class="error">Failed to load games</div>`;
  }
}

// ============================================================
// Build Game Card
// ============================================================

function renderGameCard(ev, container) {
  const countdown = getCountdownString(ev.commence_time);

  // Fixed EST time
  const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
  });

  // Extract best moneylines
  const bestMLAway = getBestOdds(ev.bookmakers, "h2h", ev.away_team);
  const bestMLHome = getBestOdds(ev.bookmakers, "h2h", ev.home_team);

  // Extract best spreads
  const bestSpreadAway = getBestOdds(ev.bookmakers, "spreads", ev.away_team);
  const bestSpreadHome = getBestOdds(ev.bookmakers, "spreads", ev.home_team);

  // Totals
  const bestOver = getBestOdds(ev.bookmakers, "totals", "Over");
  const bestUnder = getBestOdds(ev.bookmakers, "totals", "Under");

  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
      <div class="game-header">
        <div class="teams">${ev.away_team} @ ${ev.home_team}</div>
        <div class="kickoff">Kickoff: ${kickoffLocal}</div>
        <div class="countdown">⏳ ${countdown}</div>
      </div>

      <div class="odds-section">
        
        <div class="odds-row">
          <div class="label">Moneyline</div>
          <button class="bet-btn"
             onclick="addParlayLeg({ type:'ML', team:'${ev.away_team}', gameId:'${ev.id}', odds:${bestMLAway?.price || 0}, display:'${ev.away_team} ML (${bestMLAway?.price || '?'} )'})">
             ${ev.away_team}: ${bestMLAway ? bestMLAway.price : "-"}
          </button>

          <button class="bet-btn"
             onclick="addParlayLeg({ type:'ML', team:'${ev.home_team}', gameId:'${ev.id}', odds:${bestMLHome?.price || 0}, display:'${ev.home_team} ML (${bestMLHome?.price || '?'} )'})">
             ${ev.home_team}: ${bestMLHome ? bestMLHome.price : "-"}
          </button>
        </div>

        <div class="odds-row">
          <div class="label">Spread</div>

          <button class="bet-btn"
            onclick="addParlayLeg({ type:'Spread', team:'${ev.away_team}', gameId:'${ev.id}', odds:${bestSpreadAway?.price || 0}, display:'${ev.away_team} ${bestSpreadAway?.point || ''} (${bestSpreadAway?.price || '?'})'})">
            ${ev.away_team}: ${bestSpreadAway ? `${bestSpreadAway.point}  ${bestSpreadAway.price}` : "-"}
          </button>

          <button class="bet-btn"
            onclick="addParlayLeg({ type:'Spread', team:'${ev.home_team}', gameId:'${ev.id}', odds:${bestSpreadHome?.price || 0}, display:'${ev.home_team} ${bestSpreadHome?.point || ''} (${bestSpreadHome?.price || '?'})'})">
            ${ev.home_team}: ${bestSpreadHome ? `${bestSpreadHome.point}  ${bestSpreadHome.price}` : "-"}
          </button>
        </div>

        <div class="odds-row">
          <div class="label">Totals</div>

          <button class="bet-btn"
             onclick="addParlayLeg({ type:'Total', side:'Over', gameId:'${ev.id}', odds:${bestOver?.price || 0}, display:'Over ${bestOver?.point || ''} (${bestOver?.price || '?'})'})">
             Over: ${bestOver ? `${bestOver.point} ${bestOver.price}` : "-"}
          </button>

          <button class="bet-btn"
             onclick="addParlayLeg({ type:'Total', side:'Under', gameId:'${ev.id}', odds:${bestUnder?.price || 0}, display:'Under ${bestUnder?.point || ''} (${bestUnder?.price || '?'})'})">
             Under: ${bestUnder ? `${bestUnder.point} ${bestUnder.price}` : "-"}
          </button>

        </div>

      </div>
  `;

  container.appendChild(card);
}
// Countdown text (unchanged)
const countdown = getCountdownString(ev.commence_time);

// FIXED EST TIME — guaranteed
const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
});
// ============================================================
// Start
// ============================================================
document.addEventListener("DOMContentLoaded", loadGames);
