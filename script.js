import { Teams } from "./teams.js";

/* ============================================================
   HELPERS
   ============================================================ */

function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

function fmtOdds(o) {
  if (o == null) return "-";
  return o > 0 ? `+${o}` : `${o}`;
}

function fmtEV(x) {
  if (x == null || isNaN(x)) return "N/A";
  return pct(x);
}

function fmtProb(x) {
  if (x == null || isNaN(x)) return "N/A";
  return pct(x);
}

function evClass(e) {
  if (e == null || isNaN(e)) return "ev-neutral";
  if (e > 0.03) return "ev-green";
  if (e < -0.03) return "ev-red";
  return "ev-neutral";
}

function isSmartPick(ev, prob) {
  return ev != null && prob != null && ev > 0.05 && prob > 0.55;
}

function getTrendEV(key, currentEV) {
  const prev = localStorage.getItem(key);
  localStorage.setItem(key, currentEV);
  if (prev == null) return "";
  if (+currentEV > +prev) return "📈";
  if (+currentEV < +prev) return "📉";
  return "➡️";
}

function topSmartPick(game) {
  const candidates = [
    { label: `${game.away_team} ML`, ev: game.best.ml.away.ev },
    { label: `${game.home_team} ML`, ev: game.best.ml.home.ev },
    { label: `${game.away_team} Spread`, ev: game.best.spread.away.ev },
    { label: `${game.home_team} Spread`, ev: game.best.spread.home.ev },
    { label: `Over ${game.best.total.over.point}`, ev: game.best.total.over.ev },
    { label: `Under ${game.best.total.under.point}`, ev: game.best.total.under.ev }
  ];

  return candidates
    .filter(c => isSmartPick(c.ev, 0.55))
    .sort((a, b) => (b.ev ?? -999) - (a.ev ?? -999))[0];
}

function kickoffLocal(utc) {
  return new Date(utc).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });
}

/* ============================================================
   FETCH HELPERS
   ============================================================ */

async function fetchGames() {
  const r = await fetch("/api/events");
  return r.json();
}

async function fetchProps(id) {
  const r = await fetch(`/api/props?id=${id}`);
  return r.json();
}

/* ============================================================
   INITIAL LOAD
   ============================================================ */

const container = document.getElementById("games-container");
document.getElementById("refresh-btn").onclick = () => loadGames();

loadGames();

async function loadGames() {
  container.innerHTML = `<div class="loading">Loading NFL games…</div>`;

  let games = [];
  try {
    games = await fetchGames();
  } catch {
    container.innerHTML = `<div class="error">API Error</div>`;
    return;
  }

  container.innerHTML = "";

  games.forEach(g => {
    container.appendChild(createCard(g));
  });

  updateProfile(games);
}

/* ============================================================
   CARD RENDERING
   ============================================================ */

function createCard(game) {
  const card = document.createElement("div");
  card.className = "game-card";
  card.dataset.id = game.id;

  const home = Teams[game.home_team] || {};
  const away = Teams[game.away_team] || {};

  const homeAbbr = home.abbr?.toUpperCase() || game.home_team;
  const awayAbbr = away.abbr?.toUpperCase() || game.away_team;

  const best = game.best;
  const kickoff = kickoffLocal(game.commence_time);
  const topPick = topSmartPick(game);

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">
        <img src="${away.logo}" class="team-logo">
        ${game.away_team}
        <span style="opacity:0.6;"> @ </span>
        <img src="${home.logo}" class="team-logo">
        ${game.home_team}
      </div>
      <div class="kickoff">${kickoff}</div>
    </div>

    ${topPick ? `<div class="ev-badge">🔥 Smart Pick: ${topPick.label}</div>` : ''}

    <div class="market-grid">

      <div class="market-box">
        <div><strong>Moneyline</strong><br><small>Pick the winner straight up</small></div>
        <div>
          ${awayAbbr}: ${fmtOdds(best.ml.away.odds)}
          <div class="${evClass(best.ml.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.ml.away.ev)} ${getTrendEV(`ml-away-${game.id}`, best.ml.away.ev)}
          </div>
        </div>
        <div>
          ${homeAbbr}: ${fmtOdds(best.ml.home.odds)}
          <div class="${evClass(best.ml.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.ml.home.ev)} ${getTrendEV(`ml-home-${game.id}`, best.ml.home.ev)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div><strong>Spread</strong><br><small>Bet against a point handicap</small></div>
        <div>
          ${awayAbbr} ${best.spread.away.point} (${fmtOdds(best.spread.away.odds)})
          <div class="${evClass(best.spread.away.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.spread.away.ev)} ${getTrendEV(`spread-away-${game.id}`, best.spread.away.ev)}
          </div>
        </div>
        <div>
          ${homeAbbr} ${best.spread.home.point} (${fmtOdds(best.spread.home.odds)})
          <div class="${evClass(best.spread.home.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.spread.home.ev)} ${getTrendEV(`spread-home-${game.id}`, best.spread.home.ev)}
          </div>
        </div>
      </div>

      <div class="market-box">
        <div><strong>Total</strong><br><small>Bet over/under on total points</small></div>
        <div>
          Over ${best.total.over.point} (${fmtOdds(best.total.over.odds)})
          <div class="${evClass(best.total.over.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.total.over.ev)} ${getTrendEV(`total-over-${game.id}`, best.total.over.ev)}
          </div>
        </div>
        <div>
          Under ${best.total.under.point} (${fmtOdds(best.total.under.odds)})
          <div class="${evClass(best.total.under.ev)}" style="font-size:.75rem;">
            EV ${fmtEV(best.total.under.ev)} ${getTrendEV(`total-under-${game.id}`, best.total.under.ev)}
          </div>
        </div>
      </div>

    </div>
  `;

  card.appendChild(buildMainAccordion(game));
  card.appendChild(buildPropsAccordion(game));

  return card;
}

/* ============================================================
   ACCORDIONS, PROPS, ETC — Same as before
   (omitted for brevity unless you want full file again)
============================================================ */

function updateProfile(games) {
  let smartCount = 0;

  games.forEach(g => {
    const top = topSmartPick(g);
    if (top) smartCount++;
  });

  const prevStreak = +localStorage.getItem("empire-streak") || 0;
  const prevPicks = +localStorage.getItem("empire-picks") || 0;

  const picks = prevPicks + smartCount;
  localStorage.setItem("empire-picks", picks);
  localStorage.setItem("empire-streak", prevStreak + 1);

  const level = Math.floor(picks / 10) + 1;

  document.getElementById("profile-bar").textContent =
    `⚔️ Sharp Level ${level} • 🔥 Win Streak: ${prevStreak + 1} • Picks Analyzed: ${picks}`;
}
