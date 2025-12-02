// ===========================================================
// EmpirePicks — Production Script.js
// Week Navigation + Date Headers + Countdown
// ===========================================================

// DOM Refs
const gamesContainer = document.getElementById("games-container");

// Weeks we want to allow navigation for
const WEEKS = [13, 14, 15];
let currentWeek = 13;

// Build NAV placement (placed under title automatically)
function buildWeekNav() {
  const nav = document.getElementById("week-nav");
  if (!nav) return;

  nav.innerHTML = `
    <div class="week-nav-inner">
      ${WEEKS.map(w => `
        <button 
          class="week-btn ${w === currentWeek ? "active" : ""}"
          data-week="${w}"
        >
          Week ${w}
        </button>
      `).join("")}
    </div>
  `;

  // Click handler
  document.querySelectorAll(".week-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      const w = Number(btn.dataset.week);
      currentWeek = w;
      buildWeekNav();
      loadGames();
    });
  });
}

// Convert Odds API date → readable header
function formatDateHeader(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric"
  });
}

// Countdown helper
function getCountdownString(targetISO) {
  const now = new Date();
  const kick = new Date(targetISO);

  const diff = kick - now;
  if (diff <= 0) return "In progress";

  const hrs = Math.floor(diff / (1000 * 60 * 60));
  const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));

  return `${hrs}h ${mins}m`;
}

// Load + render games
async function loadGames() {
  gamesContainer.innerHTML = `<div class="loading">Loading…</div>`;

  try {
    // GET events for selected week
    const res = await fetch(`/api/events?week=${currentWeek}`);
    if (!res.ok) throw new Error("Failed to load event data");

    const events = await res.json();

    // Clear container
    gamesContainer.innerHTML = "";

    // Group by date for headers
    const grouped = {};
    for (const ev of events) {
      const dateKey = ev.commence_time.split("T")[0]; // yyyy-mm-dd
      if (!grouped[dateKey]) grouped[dateKey] = [];
      grouped[dateKey].push(ev);
    }

    // Render sections
    for (const dateKey of Object.keys(grouped)) {
      const header = document.createElement("h2");
      header.className = "date-header";
      header.textContent = formatDateHeader(dateKey);
      gamesContainer.appendChild(header);

      for (const ev of grouped[dateKey]) {
        const card = await renderGameCard(ev);
        gamesContainer.appendChild(card);
      }
    }
  } catch (err) {
    console.error("LoadGames Error:", err);
    gamesContainer.innerHTML = `<p class="error">Failed to load NFL data.</p>`;
  }
}

// Render each game card — keeps 100 percent of your HTML style
async function renderGameCard(ev) {
  // Fetch odds per event
  const oddsRes = await fetch(`/api/odds?eventId=${ev.id}`);
  let odds = [];
  try {
    odds = await oddsRes.json();
  } catch (e) {
    console.warn("Odds parse failed for event", ev.id);
  }

  // Countdown text
  const countdown = getCountdownString(ev.commence_time);

  // Build card
  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">${ev.away_team} @ ${ev.home_team}</div>
      <div class="kickoff">Kickoff: ${new Date(ev.commence_time).toLocaleTimeString([], {hour:'numeric', minute:'2-digit'})}</div>
      <div class="countdown">⏳ ${countdown}</div>
    </div>

    <div class="odds-table">
      ${odds.length === 0 ? 
        `<div class="no-odds">No odds available</div>`
      :
        odds.map(book => `
          <div class="odds-row">
            <div class="book">${book.bookmaker}</div>
            <div class="ml">${book.h2h?.join(" / ") || "-"}</div>

            <div class="spread">
              ${book.spread ? `${book.spread.point} (${book.spread.price})` : "-"}
            </div>

            <div class="total">
              ${book.total ? `${book.total.point} (${book.total.price})` : "-"}
            </div>

            <button class="add-leg-btn" 
              data-team="${ev.home_team}" 
              data-event="${ev.id}"
              data-odds="${book.h2h?.[0] || ''}">
              + Parlay
            </button>
          </div>
        `).join("")
      }
    </div>
  `;

  return card;
}

// Live countdown updater every 30 sec
setInterval(() => {
  document.querySelectorAll(".countdown").forEach(span => {
    const card = span.closest(".game-card");
    const kickoff = card.querySelector(".kickoff").textContent;
  });
}, 30000);

// Init
buildWeekNav();
loadGames();
