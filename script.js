// script.js

import { NFL_TEAMS } from "./teams.js";  // your existing map of team metadata

// utility functions from above
function impliedProbabilityFromAmerican(odds) {
  odds = Number(odds);
  if (odds > 0) return 100 / (odds + 100);
  const pos = -odds;
  return pos / (pos + 100);
}
function decimalMultiplierFromAmerican(odds) {
  odds = Number(odds);
  if (odds > 0) return (odds / 100) + 1;
  return (100 / (-odds)) + 1;
}
function expectedValue(myProb, odds, stake = 1) {
  const payout_if_win = (decimalMultiplierFromAmerican(odds) * stake) - stake;
  const p_win = myProb;
  const p_loss = 1 - p_win;
  return (p_win * payout_if_win) - (p_loss * stake);
}

// placeholder — your model or manual estimated probabilities
// In a real setup, you’d compute or input these based on data, power rankings, stats.
function modelEstimatedProbability(game, outcome, marketType) {
  // e.g. return 0.55 for 55% chance — this is user / model defined
  return 0.5;  // default to 50% if unknown
}

let parlayLegs = [];

function addParlayLeg(leg) {
  // simple dedupe by unique key
  const key = leg.gameId + "|" + leg.market + "|" + leg.outcome;
  if (parlayLegs.some(l => l.key === key)) return;
  leg.key = key;
  parlayLegs.push(leg);
  renderParlay();
}
function removeParlayLeg(key) {
  parlayLegs = parlayLegs.filter(l => l.key !== key);
  renderParlay();
}
function renderParlay() {
  const panel = document.getElementById("parlay-panel");
  if (!panel) return;
  panel.innerHTML = "";
  if (parlayLegs.length === 0) {
    panel.textContent = "No parlay legs selected.";
    return;
  }
  const ul = document.createElement("ul");
  parlayLegs.forEach(leg => {
    const li = document.createElement("li");
    li.textContent = `${leg.away} @ ${leg.home} — ${leg.market}:${leg.outcome} @ ${leg.odds}`;
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.onclick = () => removeParlayLeg(leg.key);
    li.append(" ", btn);
    ul.append(li);
  });
  panel.append(ul);
}

// main loader
async function fetchJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Fetch failed: ${r.status}`);
  return r.json();
}

async function loadAndRender() {
  try {
    const [events, oddsArr] = await Promise.all([
      fetchJson("/api/events"),
      fetchJson("/api/odds")
    ]);
    const oddsMap = new Map(oddsArr.map(o => [o.id, o]));

    const container = document.getElementById("games-container");
    container.innerHTML = "";

    for (const ev of events) {
      const odds = oddsMap.get(ev.id);
      if (!odds) continue;

      const home = ev.home_team;
      const away = ev.away_team;
      const kickoff = new Date(ev.commence_time).toLocaleString();

      const card = document.createElement("div");
      card.className = "card";

      const teamHome = NFL_TEAMS[home] || {};
      const teamAway = NFL_TEAMS[away] || {};

      // find best moneyline (or pick first bookmaker) for simplicity
      const bm = odds.bookmakers[0];
      const mlMarket = bm.markets.find(m => m.key === "h2h");
      const olines = mlMarket?.outcomes || [];

      // for each outcome (team), compute implied probability, then compute EV using model’s estimated probability
      const oddsHtml = olines.map(o => {
        const impliedP = impliedProbabilityFromAmerican(o.price);
        const myP = modelEstimatedProbability(ev, o.name, "moneyline");
        const evValue = expectedValue(myP, o.price);
        const evPercent = (evValue * 100).toFixed(1);
        return `
          <div class="line">
            <strong>${o.name} ML ${o.price > 0 ? '+'+o.price : o.price}</strong>
            <span>Implied: ${(impliedP*100).toFixed(1)}%</span>
            <span>MyP: ${(myP*100).toFixed(1)}%</span>
            <span>EV: ${evPercent}%</span>
            <button class="btn-add-parlay"
              data-game="${ev.id}"
              data-market="moneyline"
              data-outcome="${o.name}"
              data-odds="${o.price}"
            >Add to Parlay</button>
          </div>
        `;
      }).join("");

      card.innerHTML = `
        <div class="card-header">
          <div class="team away">
            ${teamAway.logo ? `<img src="${teamAway.logo}" class="logo">` : ""}
            ${away}
          </div>
          <div class="kickoff">${kickoff}</div>
          <div class="team home">
            ${home}${teamHome.logo ? `<img src="${teamHome.logo}" class="logo">` : ""}
          </div>
        </div>
        <div class="card-body">
          ${oddsHtml}
        </div>
      `;
      container.append(card);
    }

    // attach parlay-buttons
    container.querySelectorAll(".btn-add-parlay").forEach(btn => {
      btn.addEventListener("click", () => {
        addParlayLeg({
          gameId: btn.dataset.game,
          home: "", away: "",  // you may lookup names or store them in data-attrs
          market: btn.dataset.market,
          outcome: btn.dataset.outcome,
          odds: btn.dataset.odds
        });
      });
    });

    // initial render of parlay (empty)
    renderParlay();

  } catch (err) {
    console.error("Failed to load/render:", err);
    const container = document.getElementById("games-container");
    if (container) container.textContent = "Error loading data.";
  }
}

document.addEventListener("DOMContentLoaded", loadAndRender);
