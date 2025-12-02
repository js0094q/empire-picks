// --- Begin script.js ---

// Utility — simple selector
function $(sel) { return document.querySelector(sel); }
function $all(sel) { return Array.from(document.querySelectorAll(sel)); }

// Global state: current week start (Monday)
let currentWeekStart = getMonday(new Date());

// Helpers
function getMonday(d) {
  d = new Date(d);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff));
}

function addDays(d, days) {
  const nd = new Date(d);
  nd.setDate(nd.getDate() + days);
  return nd;
}

function weekString(start) {
  const end = addDays(start, 6);
  return `${start.toLocaleDateString()} – ${end.toLocaleDateString()}`;
}

// Initialize week navigation controls
function initWeekNav() {
  const navHtml = `
    <div id="week-nav" class="week-nav">
      <button id="prev-week">‹ Prev Week</button>
      <button id="this-week">This Week</button>
      <button id="next-week">Next Week ›</button>
      <span id="week-label">${weekString(currentWeekStart)}</span>
    </div>
  `;
  const gamesRoot = $("#gamesContainer");
  if (gamesRoot) {
    gamesRoot.insertAdjacentHTML("beforebegin", navHtml);
    $("#prev-week").addEventListener("click", () => {
      currentWeekStart = addDays(currentWeekStart, -7);
      loadAll();
    });
    $("#next-week").addEventListener("click", () => {
      currentWeekStart = addDays(currentWeekStart, 7);
      loadAll();
    });
    $("#this-week").addEventListener("click", () => {
      currentWeekStart = getMonday(new Date());
      loadAll();
    });
  }
}

// Countdown logic
function startCountdown(el, kickoffIso) {
  const kickoff = Date.parse(kickoffIso);
  function update() {
    const diff = kickoff - Date.now();
    if (diff <= 0) {
      el.textContent = "LIVE / Kicked Off";
      clearInterval(el._cd);
      return;
    }
    const d = Math.floor(diff / (1000*60*60*24));
    const h = Math.floor((diff % (1000*60*60*24)) / (1000*60*60));
    const m = Math.floor((diff % (1000*60*60)) / (1000*60));
    const s = Math.floor((diff % (1000*60)) / 1000);
    el.textContent = `${d}d ${h}h ${m}m ${s}s`;
  }
  update();
  el._cd = setInterval(update, 1000);
}

// Render a single game card (with countdown & consensus)
function renderGameCard(ev, oddsList) {
  const kickoff = new Date(ev.commence_time);
  const card = document.createElement("div");
  card.className = "game-card";

  const header = document.createElement("div");
  header.className = "game-header";
  header.textContent = `${ev.away_team} @ ${ev.home_team} — ${kickoff.toLocaleTimeString()}`
  card.append(header);

  // add countdown
  const cd = document.createElement("div");
  cd.className = "countdown";
  card.append(cd);
  startCountdown(cd, ev.commence_time);

  // table of odds
  const tbl = document.createElement("table");
  tbl.className = "odds-table";
  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Bookmaker</th><th>Market</th><th>Line / Odds</th></tr>`;
  tbl.append(thead);
  const tbody = document.createElement("tbody");
  tbl.append(tbody);

  let mlSum = 0, mlCount = 0;
  // iterate over oddsList (bookmakers)
  oddsList.forEach(bm => {
    bm.markets.forEach(m => {
      m.outcomes.forEach(o => {
        const row = document.createElement("tr");
        const name = document.createElement("td");
        name.textContent = bm.title;
        const market = document.createElement("td");
        market.textContent = m.key;
        const line = document.createElement("td");
        line.textContent = `${o.name} ${o.price}`;
        row.append(name, market, line);
        tbody.append(row);
        if (m.key === "h2h") {
          mlSum += Number(o.price);
          mlCount++;
        }
      });
    });
  });

  // consensus (simple average) for ML
  if (mlCount > 0) {
    const avg = Math.round(mlSum / mlCount);
    const tr = document.createElement("tr");
    tr.className = "consensus-row";
    tr.innerHTML = `<td colspan="3">Consensus ML: ~ ${avg}</td>`;
    tbody.append(tr);
  }

  card.append(tbl);
  return card;
}

// Main loader: fetch events (assuming same feed) and render
async function loadAll() {
  const gamesRoot = $("#gamesContainer");
  if (!gamesRoot) return;

  gamesRoot.innerHTML = ""; // clear old

  // fetch or refer existing events + odds data
  // assume global EVENTS & ODDS BY ID (like byID from your code)
  const events = window.EVENTS || [];
  const byID = window.ODDS_BY_ID || {};

  // filter by week
  const weekStart = currentWeekStart.getTime();
  const weekEnd = addDays(currentWeekStart, 7).getTime();

  const valid = events.filter(ev => {
    const o = byID[ev.id];
    if (!o) return false;
    const k = Date.parse(ev.commence_time);
    return k >= weekStart && k < weekEnd;
  });

  if (valid.length === 0) {
    gamesRoot.textContent = "No games this week.";
    $("#week-label").textContent = weekString(currentWeekStart);
    return;
  }

  // group by date
  const byDate = valid.reduce((acc, ev) => {
    const dateKey = new Date(ev.commence_time).toDateString();
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(ev);
    return acc;
  }, {});

  const sortedDates = Object.keys(byDate)
    .sort((a, b) => new Date(a) - new Date(b));

  sortedDates.forEach(dateStr => {
    const header = document.createElement("h2");
    header.className = "date-header";
    header.textContent = dateStr;
    gamesRoot.append(header);

    byDate[dateStr].forEach(ev => {
      gamesRoot.append(renderGameCard(ev, byID[ev.id]));
    });
  });

  $("#week-label").textContent = weekString(currentWeekStart);
}

// On load
document.addEventListener("DOMContentLoaded", () => {
  initWeekNav();
  loadAll();
});

// --- End script.js ---
