// script-full-odds.js — EmpirePicks NFL Dashboard (full odds display + dynamic markets)

import { NFL_TEAMS } from "./teams.js";

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

      const teamHome = NFL_TEAMS[home] || {};
      const teamAway = NFL_TEAMS[away] || {};

      const card = document.createElement("div");
      card.className = "card card-full-odds";

      // build header
      const headerHtml = `
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
      `;

      // build odds section dynamically
      let oddsHtml = `<div class="odds-wrapper">`;

      g.bookmakers.forEach(bm => {
        oddsHtml += `<div class="bookmaker">
                      <div class="bm-title">${bm.title}</div>
                      <div class="markets">`;
        bm.markets.forEach(mkt => {
          oddsHtml += `<div class="market">
                         <div class="market-key">${mkt.key}</div>
                         <table class="market-outcomes">`;
          mkt.outcomes.forEach(o => {
            oddsHtml += `<tr>
                           <td class="outcome-name">${o.name}</td>
                           ${o.point !== undefined ? `<td class="outcome-point">${o.point}</td>` : ""}
                           <td class="outcome-price">${o.price}</td>
                         </tr>`;
          });
          oddsHtml += `</table></div>`;
        });
        oddsHtml += `</div></div>`;
      });

      oddsHtml += `</div>`;  // .odds-wrapper

      card.innerHTML = headerHtml + `<div class="card-body">${oddsHtml}</div>`;

      // if team color available, apply gradient
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
