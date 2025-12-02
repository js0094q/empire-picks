// script.js — EmpirePicks NFL Dashboard (Option-A, live odds only)

import { NFL_TEAMS } from "./teams.js";  // adjust path if needed

function impliedProb(odds) {
  odds = Number(odds);
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) {
    throw new Error(`Fetch failed: ${url} — status ${resp.status}`);
  }
  return resp.json();
}

async function loadGames() {
  try {
    const [events, oddsWrap] = await Promise.all([
      fetchJson("/api/events"),
      fetchJson("/api/odds")
    ]);

    const oddsById = new Map(oddsWrap.map(o => [o.id, o]));

    const container = document.getElementById("games-container");
    if (!container) {
      console.error("No container element with id 'games-container'");
      return;
    }
    container.innerHTML = "";

    for (const ev of events) {
      const g = oddsById.get(ev.id);
      if (!g) continue;

      const home = ev.home_team;
      const away = ev.away_team;
      const kickoff = new Date(ev.commence_time).toLocaleString();

      const bm = g.bookmakers && g.bookmakers[0];
      if (!bm) continue;

      const ml = bm.markets.find(m => m.key === "h2h");
      const sp = bm.markets.find(m => m.key === "spreads");
      const tot = bm.markets.find(m => m.key === "totals");
      if (!ml || !sp || !tot) continue;

      const mlHome = ml.outcomes.find(o => o.name === home)?.price;
      const mlAway = ml.outcomes.find(o => o.name === away)?.price;
      const spreadPoint = sp.outcomes.find(o => o.name === home)?.point;
      const totalPoint = tot.outcomes[0]?.point;

      const teamHome = NFL_TEAMS[home] || {};
      const teamAway = NFL_TEAMS[away] || {};

      const card = document.createElement("div");
      card.className = "card card-dark";

      card.innerHTML = `
        <div class="card-header">
          <div class="team away">
            ${teamAway.logo ? `<img src="${teamAway.logo}" alt="${away}" class="logo">` : ""}
            <span>${away}</span>
          </div>
          <div class="kickoff">${kickoff}</div>
          <div class="team home">
            <span>${home}</span>
            ${teamHome.logo ? `<img src="${teamHome.logo}" alt="${home}" class="logo">` : ""}
          </div>
        </div>
        <div class="card-body">
          <div class="odds">
            <strong>Moneyline:</strong> ${away} ${mlAway}, ${home} ${mlHome}<br>
            <strong>Spread (home):</strong> ${home} ${spreadPoint} pts<br>
            ${totalPoint != null ? `<strong>Total (O/U):</strong> ${totalPoint}` : ""}
          </div>
        </div>
      `;

      if (teamHome.primary && teamHome.secondary) {
        card.style.background = `linear-gradient(135deg, ${teamHome.primary} 0%, ${teamHome.secondary} 60%)`;
        card.style.borderColor = teamHome.secondary;
      }

      container.append(card);
    }
  } catch (err) {
    console.error("Error loading games:", err);
    const container = document.getElementById("games-container");
    if (container) container.textContent = "Failed to load NFL data — try refreshing.";
  }
}

document.addEventListener("DOMContentLoaded", loadGames);
