// ========================================================
// EmpirePicks Frontend Logic (Full Replacement)
// ========================================================

import { NFL_TEAMS } from "./teams.js";

// --------------------------------------------------------
// DOM Helpers
// --------------------------------------------------------
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// --------------------------------------------------------
// Odds / Math Helpers
// --------------------------------------------------------

const fmtMoney = o => (o > 0 ? `+${o}` : o);

// American odds → implied probability (with vig)
function impliedProb(odds) {
  if (odds == null) return null;
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

// Compute no-vig probabilities for a 2-outcome market (A/B)
function noVigPair(aOdds, bOdds) {
  const pa = impliedProb(aOdds);
  const pb = impliedProb(bOdds);
  if (pa == null || pb == null) return { pa: null, pb: null };

  const sum = pa + pb;
  if (!sum || !isFinite(sum)) return { pa: null, pb: null };

  return { pa: pa / sum, pb: pb / sum };
}

// EV per 1 unit staked given probability p and American odds
function expectedValue(p, odds) {
  if (p == null || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return p * payout - (1 - p) * 1; // in "units"
}

// --------------------------------------------------------
// API Client
// --------------------------------------------------------

const api = {
  async events() {
    const res = await fetch("/api/events");
    if (!res.ok) throw new Error("Failed to load events");
    return res.json();
  },
  async odds() {
    const res = await fetch("/api/odds");
    if (!res.ok) throw new Error("Failed to load odds");
    return res.json();
  },
  async props(eventId) {
    const res = await fetch(`/api/event-odds?eventId=${encodeURIComponent(eventId)}`);
    if (!res.ok) throw new Error("Failed to load props");
    return res.json();
  }
};

// --------------------------------------------------------
// ESPN-Style Game Analytics
// --------------------------------------------------------

function computeGameAnalytics(game, awayName, homeName) {
  const result = {
    away: awayName,
    home: homeName,
    winner: null,
    winnerProb: 0.5,
    bestSpread: null,
    bestSpreadProb: 0.5,
    bestTotal: null,
    bestTotalProb: 0.5
  };

  if (!game || !Array.isArray(game.bookmakers) || !game.bookmakers.length) {
    return result;
  }

  // ---------- Moneyline / Win Probabilities ----------
  const moneySamples = [];

  game.bookmakers.forEach(bm => {
    const h2h = (bm.markets || []).find(m => m.key === "h2h");
    if (!h2h || !Array.isArray(h2h.outcomes)) return;
    const away = h2h.outcomes.find(o => o.name === awayName);
    const home = h2h.outcomes.find(o => o.name === homeName);
    if (!away || !home) return;

    const { pa, pb } = noVigPair(away.price, home.price);
    if (pa == null || pb == null) return;

    moneySamples.push({ pa, pb });
  });

  if (moneySamples.length) {
    const avgAway = moneySamples.reduce((s, r) => s + r.pa, 0) / moneySamples.length;
    const avgHome = moneySamples.reduce((s, r) => s + r.pb, 0) / moneySamples.length;
    const norm = avgAway + avgHome || 1;
    const pAway = avgAway / norm;
    const pHome = avgHome / norm;

    if (pAway >= pHome) {
      result.winner = awayName;
      result.winnerProb = pAway;
    } else {
      result.winner = homeName;
      result.winnerProb = pHome;
    }
  }

  // ---------- Spread Consensus ----------
  const spreadSamples = [];

  game.bookmakers.forEach(bm => {
    const m = (bm.markets || []).find(m => m.key === "spreads");
    if (!m || !Array.isArray(m.outcomes)) return;
    const away = m.outcomes.find(o => o.name === awayName);
    const home = m.outcomes.find(o => o.name === homeName);
    if (!away || !home) return;

    const { pa, pb } = noVigPair(away.price, home.price);
    if (pa == null || pb == null) return;

    // choose favorite side
    if (pa >= pb) {
      spreadSamples.push({
        team: awayName,
        point: away.point,
        p: pa
      });
    } else {
      spreadSamples.push({
        team: homeName,
        point: home.point,
        p: pb
      });
    }
  });

  if (spreadSamples.length) {
    // pick by highest p
    const best = spreadSamples.reduce((a, b) => (b.p > a.p ? b : a));
    result.bestSpread = `${best.team} ${best.point}`;
    result.bestSpreadProb = best.p;
  }

  // ---------- Total Consensus ----------
  const totalSamples = [];

  game.bookmakers.forEach(bm => {
    const m = (bm.markets || []).find(m => m.key === "totals");
    if (!m || !Array.isArray(m.outcomes)) return;
    const over = m.outcomes.find(o => o.name === "Over");
    const under = m.outcomes.find(o => o.name === "Under");
    if (!over || !under) return;

    const { pa, pb } = noVigPair(over.price, under.price);
    if (pa == null || pb == null) return;

    // treat pOver as sample
    totalSamples.push({
      side: pa >= pb ? "Over" : "Under",
      point: over.point, // same for both
      p: Math.max(pa, pb)
    });
  });

  if (totalSamples.length) {
    const best = totalSamples.reduce((a, b) => (b.p > a.p ? b : a));
    result.bestTotal = `${best.side} ${best.point}`;
    result.bestTotalProb = best.p;
  }

  return result;
}

function analyticsHTML(a) {
  if (!a.winner) {
    return `
      <div class="analytics">
        <div class="analytics-title">📊 EmpirePicks Forecast</div>
        <div class="analytics-body">
          Insufficient odds data to compute forecast.
        </div>
      </div>
    `;
  }

  const [spreadTeam, spreadLine] = (a.bestSpread || "").split(" ");
  const [totalSide, totalLine] = (a.bestTotal || "").split(" ");

  return `
    <div class="analytics">
      <div class="analytics-title">📊 EmpirePicks Forecast</div>
      <div class="analytics-body">
        <strong>Win Probability</strong><br/>
        • ${a.winner} favored at ${(a.winnerProb * 100).toFixed(1)}%<br/><br/>

        <strong>Spread Consensus</strong><br/>
        • ${a.bestSpread || "N/A"} 
        ${a.bestSpreadProb ? `(${(a.bestSpreadProb * 100).toFixed(1)}% confidence)` : ""}<br/><br/>

        <strong>Total Consensus</strong><br/>
        • ${a.bestTotal || "N/A"}
        ${a.bestTotalProb ? `(${(a.bestTotalProb * 100).toFixed(1)}% confidence)` : ""}
      </div>
    </div>
  `;
}

// --------------------------------------------------------
// Game Lines + EV Table
// --------------------------------------------------------

function renderLines(container, game, analytics) {
  if (!game || !Array.isArray(game.bookmakers) || !game.bookmakers.length) {
    container.innerHTML = `<p>No odds available for this game.</p>`;
    return;
  }

  const rows = [];

  game.bookmakers.forEach(bm => {
    const rec = {
      book: bm.title,
      awayMoneyline: "–",
      homeMoneyline: "–",
      spread: "–",
      total: "–",
      bestNote: ""
    };

    const h2h = (bm.markets || []).find(m => m.key === "h2h");
    if (h2h && Array.isArray(h2h.outcomes)) {
      const away = h2h.outcomes.find(o => o.name === analytics.away);
      const home = h2h.outcomes.find(o => o.name === analytics.home);
      if (away) rec.awayMoneyline = fmtMoney(away.price);
      if (home) rec.homeMoneyline = fmtMoney(home.price);

      if (analytics.winner === analytics.away && away) {
        const { pa } = noVigPair(away.price, home?.price ?? null);
        const ev = expectedValue(pa, away.price);
        rec.bestNote = ev != null ? `EV ${ev.toFixed(3)} (away)` : rec.bestNote;
      } else if (analytics.winner === analytics.home && home) {
        const { pb } = noVigPair(away?.price ?? null, home.price);
        const ev = expectedValue(pb, home.price);
        rec.bestNote = ev != null ? `EV ${ev.toFixed(3)} (home)` : rec.bestNote;
      }
    }

    const spread = (bm.markets || []).find(m => m.key === "spreads");
    if (spread && Array.isArray(spread.outcomes)) {
      const away = spread.outcomes.find(o => o.name === analytics.away);
      const home = spread.outcomes.find(o => o.name === analytics.home);
      if (away && home) {
        rec.spread = `${analytics.away} ${away.point} / ${fmtMoney(away.price)} | ${analytics.home} ${home.point} / ${fmtMoney(home.price)}`;
      }
    }

    const total = (bm.markets || []).find(m => m.key === "totals");
    if (total && Array.isArray(total.outcomes)) {
      const over = total.outcomes.find(o => o.name === "Over");
      const under = total.outcomes.find(o => o.name === "Under");
      if (over && under) {
        rec.total = `O ${over.point} ${fmtMoney(over.price)} / U ${under.point} ${fmtMoney(under.price)}`;
      }
    }

    rows.push(rec);
  });

  // Mark the absolute best EV row
  let bestRow = null;
  rows.forEach(r => {
    if (!r.bestNote.includes("EV")) return;
    const match = r.bestNote.match(/EV ([\-0-9.]+)/);
    if (!match) return;
    const ev = parseFloat(match[1]);
    if (!bestRow || ev > bestRow.ev) bestRow = { row: r, ev };
  });

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Book</th>
          <th>Moneyline</th>
          <th>Spread</th>
          <th>Total</th>
          <th>Note</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.book}</td>
            <td>${r.awayMoneyline} / ${r.homeMoneyline}</td>
            <td>${r.spread}</td>
            <td>${r.total}</td>
            <td>${r === (bestRow && bestRow.row) ? `🔥 Best Bet (${r.bestNote})` : r.bestNote}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// --------------------------------------------------------
// Player Props Rendering
// --------------------------------------------------------

function renderProps(container, propsPayload) {
  if (!propsPayload || !propsPayload.props || !Array.isArray(propsPayload.props.bookmakers)) {
    container.innerHTML = `<p>No props available for this game.</p>`;
    return;
  }

  const bookmakers = propsPayload.props.bookmakers;

  // Map: marketKey -> [records...]
  const groups = {};

  bookmakers.forEach(bm => {
    (bm.markets || []).forEach(m => {
      const key = m.key;
      if (!groups[key]) groups[key] = [];
      (m.outcomes || []).forEach(o => {
        groups[key].push({
          book: bm.title,
          player: o.description || o.name || "Player",
          side: o.name,            // Over / Under / Yes / No
          point: o.point,
          price: o.price
        });
      });
    });
  });

  const order = [
    "player_anytime_td",
    "player_pass_yds",
    "player_pass_tds",
    "player_rush_yds",
    "player_receptions"
  ];

  const label = k => ({
    player_anytime_td: "Anytime TD",
    player_pass_yds:   "Passing Yards",
    player_pass_tds:   "Passing TDs",
    player_rush_yds:   "Rushing Yards",
    player_receptions: "Receptions"
  }[k] || k);

  let html = "";

  order.forEach(key => {
    const arr = groups[key];
    if (!arr || !arr.length) return;

    html += `<h3 style="margin-top:1rem;">${label(key)}</h3>`;
    html += `
      <table class="table">
        <thead>
          <tr>
            <th>Player</th>
            <th>Book</th>
            <th>Side</th>
            <th>Line</th>
            <th>Odds</th>
          </tr>
        </thead>
        <tbody>
          ${arr.map(r => `
            <tr>
              <td>${r.player}</td>
              <td>${r.book}</td>
              <td>${r.side}</td>
              <td>${r.point ?? "–"}</td>
              <td>${fmtMoney(r.price)}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  });

  if (!html) {
    html = `<p>No props available for this game.</p>`;
  }

  container.innerHTML = html;
}

// --------------------------------------------------------
// Game Card Rendering
// --------------------------------------------------------

function renderGame(ev, oddsGame) {
  const card = document.createElement("div");
  card.className = "card";

  const kickoff = new Date(ev.commence_time).toLocaleString();
  const awayName = ev.away_team;
  const homeName = ev.home_team;

  card.innerHTML = `
    <div class="card-header">
      <div class="card-title-row">
        <div class="team-label away">${awayName}</div>
        <div class="at">@</div>
        <div class="team-label home">${homeName}</div>
      </div>
      <small>${kickoff}</small>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="lines">Game Lines</div>
      <div class="tab" data-tab="props">Player Props</div>
    </div>

    <div class="tab-content active" data-panel="lines"></div>
    <div class="tab-content" data-panel="props"><em>Click "Player Props" to load.</em></div>
  `;

  // Logos & color
  const away = NFL_TEAMS[awayName];
  const home = NFL_TEAMS[homeName];

  if (away || home) {
    const header = card.querySelector(".card-header");
    header.insertAdjacentHTML(
      "afterbegin",
      `
      <div class="logo-row">
        <img src="${away?.logo || ""}" alt="${awayName}" class="team-logo">
        <span class="vs-spacer"></span>
        <img src="${home?.logo || ""}" alt="${homeName}" class="team-logo">
      </div>
      `
    );
    if (home) {
      card.style.background = `linear-gradient(135deg, ${home.primary} 0%, ${home.secondary} 45%, #0d1228 95%)`;
      card.style.borderColor = home.secondary;
    }
  }

  const analytics = computeGameAnalytics(oddsGame, awayName, homeName);
  const header = card.querySelector(".card-header");
  header.insertAdjacentHTML("beforeend", analyticsHTML(analytics));

  // Lines
  const linesContainer = card.querySelector('[data-panel="lines"]');
  renderLines(linesContainer, oddsGame, analytics);

  // Tabs
  const tabs = card.querySelectorAll(".tab");
  const panels = card.querySelectorAll(".tab-content");

  tabs.forEach(tab => {
    tab.addEventListener("click", async () => {
      tabs.forEach(t => t.classList.remove("active"));
      panels.forEach(p => p.classList.remove("active"));

      tab.classList.add("active");
      const panel = card.querySelector(`[data-panel="${tab.dataset.tab}"]`);
      if (panel) panel.classList.add("active");

      if (tab.dataset.tab === "props" && !panel.dataset.loaded) {
        panel.textContent = "Loading props…";
        try {
          const propsPayload = await api.props(ev.id);
          renderProps(panel, propsPayload);
        } catch (err) {
          panel.textContent = "Failed to load props.";
        }
        panel.dataset.loaded = "1";
      }
    });
  });

  return card;
}

// --------------------------------------------------------
// Root wiring
// --------------------------------------------------------

const gamesEl = $("#games");
const refreshBtn = $("#refreshBtn");

if (refreshBtn) {
  refreshBtn.addEventListener("click", () => {
    loadAll();
  });
}

// --------------------------------------------------------
// Main Load
// --------------------------------------------------------

async function loadAll() {
  if (!gamesEl) return;
  gamesEl.textContent = "Loading NFL week data…";

  try {
    const [events, oddsWrap] = await Promise.all([
      api.events(),
      api.odds()
    ]);

    const odds = oddsWrap.data ?? oddsWrap;
    const byId = Object.fromEntries((odds || []).map(g => [g.id, g]));

    const now = Date.now();
    const cutoff = 4 * 60 * 60 * 1000; // 4h after kickoff

    const validGames = (events || []).filter(ev => {
      if (!byId[ev.id]) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoff;
    });

    gamesEl.innerHTML = "";
    if (!validGames.length) {
      gamesEl.textContent = "No NFL games in the current window.";
      return;
    }

    validGames.forEach(ev => {
      const card = renderGame(ev, byId[ev.id]);
      gamesEl.appendChild(card);
    });
  } catch (err) {
    console.error(err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

// Kick it off
loadAll();
