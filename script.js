// script.js — NFL Odds + Parlay Dashboard

import { NFL_TEAMS } from "./teams.js";  // adjust path if needed

function americanToDecimal(odds) {
  odds = Number(odds);
  if (odds > 0) return (odds / 100) + 1;
  return (100 / Math.abs(odds)) + 1;
}

function decimalToAmerican(dec) {
  if (dec >= 2) {
    return "+" + Math.round((dec - 1) * 100);
  } else {
    return "-" + Math.round(100 / (dec - 1));
  }
}

function formatMoney(x) {
  return "$" + Number(x).toLocaleString(undefined, {minimumFractionDigits:2, maximumFractionDigits:2});
}

let parlayLegs = [];

function addParlayLeg(leg) {
  // avoid duplicates — by game + type
  const key = leg.gameId + "|" + leg.type + "|" + leg.outcome;
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
  const container = document.getElementById("parlay-legs");
  container.innerHTML = "";

  if (parlayLegs.length === 0) {
    document.getElementById("parlay-summary").textContent = "No legs selected";
    document.getElementById("parlay-payout").textContent = "";
    return;
  }

  parlayLegs.forEach(l => {
    const div = document.createElement("div");
    div.className = "parlay-leg";
    div.textContent = `${l.home} vs ${l.away} — ${l.type} → ${l.outcome} (${l.odds}) `;

    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.addEventListener("click", () => removeParlayLeg(l.key));
    div.append(btn);

    container.append(div);
  });

  const dec = parlayLegs.reduce((acc, l) => acc * americanToDecimal(l.odds), 1);
  const stake = Number(document.getElementById("parlay-stake").value) || 0;
  const payout = stake * dec;
  const profit = payout - stake;

  document.getElementById("parlay-summary").textContent =
    `Legs: ${parlayLegs.length} — Combined Odds: ${decimalToAmerican(dec)} (decimal ${dec.toFixed(2)}×)`;
  document.getElementById("parlay-payout").textContent =
    `If you wager ${formatMoney(stake)}, potential return: ${formatMoney(payout)} (profit: ${formatMoney(profit)})`;
}

document.getElementById("parlay-stake").addEventListener("input", renderParlay);

async function fetchJson(url) {
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`Fetch failed ${url} — ${resp.status}`);
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
    container.innerHTML = "";

    for (const ev of events) {
      const g = oddsById.get(ev.id);
      if (!g) continue;

      const home = ev.home_team;
      const away = ev.away_team;
      const kickoff = new Date(ev.commence_time).toLocaleString();

      const bm = g.bookmakers && g.bookmakers[0];
      if (!bm) continue;

      // Simplest markets: moneyline, spread (home), total over/under if exists
      const ml = bm.markets.find(m => m.key === "h2h");
      const sp = bm.markets.find(m => m.key === "spreads");
      const tot = bm.markets.find(m => m.key === "totals");

      const mlHome = ml?.outcomes.find(o => o.name === home)?.price;
      const mlAway = ml?.outcomes.find(o => o.name === away)?.price;
      const spreadHome = sp?.outcomes.find(o => o.name === home)?.point;
      const spreadAway = sp?.outcomes.find(o => o.name === away)?.point;
      const total = tot?.outcomes?.[0]?.point;

      const card = document.createElement("div");
      card.className = "card";

      card.innerHTML = `
        <div class="card-header">
          <div class="team away">
            <img src="${NFL_TEAMS[away]?.logo || ''}" alt="${away}" class="logo">
            <span>${away}</span>
          </div>
          <div class="kickoff">${kickoff}</div>
          <div class="team home">
            <span>${home}</span>
            <img src="${NFL_TEAMS[home]?.logo || ''}" alt="${home}" class="logo">
          </div>
        </div>
        <div class="card-body">
          <div class="odds">
            ${ mlAway != null ? `<div>${away} ML: ${mlAway} <button class="btn-parlay" data-odds="${mlAway}" data-game="${ev.id}" data-home="${home}" data-away="${away}" data-type="ML" data-outcome="${away}">+ Parlay</button></div>` : "" }
            ${ mlHome != null ? `<div>${home} ML: ${mlHome} <button class="btn-parlay" data-odds="${mlHome}" data-game="${ev.id}" data-home="${home}" data-away="${away}" data-type="ML" data-outcome="${home}">+ Parlay</button></div>` : "" }
            ${ spreadHome != null ? `<div>${home} Spread: ${spreadHome} <button class="btn-parlay" data-odds="${sp.outcomes.find(o=>o.name===home).price}" data-game="${ev.id}" data-home="${home}" data-away="${away}" data-type="Spread" data-outcome="${home}">+ Parlay</button></div>` : "" }
            ${ total != null ? `<div>Total O/U: ${total}</div>` : "" }
          </div>
        </div>
      `;

      container.append(card);
    }

    // attach parlay-buttons listeners
    container.querySelectorAll(".btn-parlay").forEach(btn => {
      btn.addEventListener("click", () => {
        const leg = {
          gameId: btn.dataset.game,
          home: btn.dataset.home,
          away: btn.dataset.away,
          type: btn.dataset.type,
          outcome: btn.dataset.outcome,
          odds: btn.dataset.odds
        };
        addParlayLeg(leg);
      });
    });

  } catch (err) {
    console.error("Error loading games:", err);
    const container = document.getElementById("games-container");
    container.textContent = "Failed to load data — try refresh";
  }
}

document.addEventListener("DOMContentLoaded", loadGames);
