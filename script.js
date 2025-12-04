// ============================================================
//  EMPIREPICKS NFL FRONT-END SCRIPT (SAFARI-SAFE)
//  Clean, unified, no-shadowing, two-week compatible
// ============================================================

// ------------------------------------------------------------
// GLOBAL PARLAY FALLBACK
// ------------------------------------------------------------
if (typeof window.addParlayLeg !== "function") {
  window.addParlayLeg = function fallbackAddLeg(leg) {
    console.warn("Parlay system not initialized yet. Queued leg:", leg);
    window._pendingParlayLegs = window._pendingParlayLegs || [];
    window._pendingParlayLegs.push(leg);
  };
}

// ------------------------------------------------------------
//  UNIVERSAL HELPERS (NO SHADOWING)
// ------------------------------------------------------------

// Convert American odds to probability
function impliedProbability(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

// Countdown text
function getCountdownString(utc) {
  const kickoff = new Date(utc);
  const now = new Date();
  const diff = kickoff - now;

  if (diff <= 0) return "LIVE";

  const hrs = Math.floor(diff / 3600000);
  const mins = Math.floor((diff % 3600000) / 60000);
  return `${hrs}h ${mins}m`;
}

// Get EST kickoff string
function getKickoffEST(utc) {
  return new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true
  });
}

// Best odds finder
function getBestOdds(bookmakers, marketKey, outcomeName) {
  if (!Array.isArray(bookmakers)) return null;

  let best = null;
  for (const b of bookmakers) {
    const market = (b.markets || []).find(m => m.key === marketKey);
    if (!market) continue;

    const outcome = (market.outcomes || []).find(o => o.name === outcomeName);
    if (!outcome) continue;

    if (!best || outcome.price > best.price) {
      best = { ...outcome, book: b.key };
    }
  }
  return best;
}

// ------------------------------------------------------------
//  FETCH NFL EVENTS (already filtered by backend two-week window)
// ------------------------------------------------------------

async function loadGames() {
  const container = document.getElementById("games");
  if (!container) return;

  container.innerHTML = `<div class="loading">Loading games...</div>`;

  try {
    const r = await fetch("/api/events");
    if (!r.ok) {
      container.innerHTML = `<div class="error">Failed to load games</div>`;
      return;
    }

    const events = await r.json();

    if (!Array.isArray(events) || events.length === 0) {
      container.innerHTML = `<div class="error">No games available</div>`;
      return;
    }

    // Sort games by kickoff
    events.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

    container.innerHTML = "";

    for (const ev of events) {
      renderGameCard(ev, container);
    }

  } catch (err) {
    console.error("Game load failed:", err);
    container.innerHTML = `<div class="error">Failed to load games</div>`;
  }
}

// ------------------------------------------------------------
// BUILD GAME CARD
// ------------------------------------------------------------

function renderGameCard(ev, container) {
  const countdown = getCountdownString(ev.commence_time);
  const kickoffLocal = getKickoffEST(ev.commence_time);

  // Get best ML / Spread / Totals
  const bestMLAway = getBestOdds(ev.bookmakers, "h2h", ev.away_team);
  const bestMLHome = getBestOdds(ev.bookmakers, "h2h", ev.home_team);

  const bestSpreadAway = getBestOdds(ev.bookmakers, "spreads", ev.away_team);
  const bestSpreadHome = getBestOdds(ev.bookmakers, "spreads", ev.home_team);

  const bestOver = getBestOdds(ev.bookmakers, "totals", "Over");
  const bestUnder = getBestOdds(ev.bookmakers, "totals", "Under");

  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">${ev.away_team} @ ${ev.home_team}</div>
      <div class="kickoff">Kickoff (EST): ${kickoffLocal}</div>
      <div class="countdown">⏳ ${countdown}</div>
    </div>

    <div class="odds-section">

      <div class="odds-row">
        <div class="label">Moneyline</div>

        <button class="bet-btn"
          onclick="addParlayLeg({
            type:'ML',
            team:'${ev.away_team}',
            gameId:'${ev.id}',
            odds:${bestMLAway?.price ?? 0},
            display:'${ev.away_team} ML (${bestMLAway?.price ?? "?"})'
          })">
          ${ev.away_team}: ${bestMLAway ? bestMLAway.price : "-"}
        </button>

        <button class="bet-btn"
          onclick="addParlayLeg({
            type:'ML',
            team:'${ev.home_team}',
            gameId:'${ev.id}',
            odds:${bestMLHome?.price ?? 0},
            display:'${ev.home_team} ML (${bestMLHome?.price ?? "?"})'
          })">
          ${ev.home_team}: ${bestMLHome ? bestMLHome.price : "-"}
        </button>
      </div>

      <div class="odds-row">
        <div class="label">Spread</div>

        <button class="bet-btn"
          onclick="addParlayLeg({
            type:'Spread',
            team:'${ev.away_team}',
            gameId:'${ev.id}',
            odds:${bestSpreadAway?.price ?? 0},
            display:'${ev.away_team} ${bestSpreadAway?.point ?? ""} (${bestSpreadAway?.price ?? "?"})'
          })">
          ${bestSpreadAway ? `${bestSpreadAway.point} ${bestSpreadAway.price}` : "-"}
        </button>

        <button class="bet-btn"
          onclick="addParlayLeg({
            type:'Spread',
            team:'${ev.home_team}',
            gameId:'${ev.id}',
            odds:${bestSpreadHome?.price ?? 0},
            display:'${ev.home_team} ${bestSpreadHome?.point ?? ""} (${bestSpreadHome?.price ?? "?"})'
          })">
          ${bestSpreadHome ? `${bestSpreadHome.point} ${bestSpreadHome.price}` : "-"}
        </button>
      </div>

      <div class="odds-row">
        <div class="label">Totals</div>

        <button class="bet-btn"
          onclick="addParlayLeg({
            type:'Total',
            side:'Over',
            gameId:'${ev.id}',
            odds:${bestOver?.price ?? 0},
            display:'Over ${bestOver?.point ?? ""} (${bestOver?.price ?? "?"})'
          })">
          Over: ${bestOver ? `${bestOver.point} ${bestOver.price}` : "-"}
        </button>

        <button class="bet-btn"
          onclick="addParlayLeg({
            type:'Total',
            side:'Under',
            gameId:'${ev.id}',
            odds:${bestUnder?.price ?? 0},
            display:'Under ${bestUnder?.point ?? ""} (${bestUnder?.price ?? "?"})'
          })">
          Under: ${bestUnder ? `${bestUnder.point} ${bestUnder.price}` : "-"}
        </button>
      </div>

    </div>
  `;

  container.appendChild(card);
}

// ------------------------------------------------------------
// STARTUP
// ------------------------------------------------------------
document.addEventListener("DOMContentLoaded", loadGames);
