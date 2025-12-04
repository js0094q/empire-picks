import { NFL_TEAMS } from "./teams.js";

function implied(odds){ return odds>0?100/(odds+100):-odds/(-odds+100); }
function evPercent(val){ return (val*100).toFixed(1); }

document.addEventListener("DOMContentLoaded", loadGames);

async function loadGames(){
  const box = document.getElementById("games");
  box.innerHTML = "Loading...";

  const r = await fetch("/api/events");
  if (!r.ok){
    box.innerHTML = "Failed loading events.";
    return;
  }

  const games = await r.json();
  box.innerHTML = "";

  games.sort((a,b)=>b.bestEV-a.bestEV);

  games.forEach(g => renderGame(g, box));
}

function renderGame(g, box){
  const away = NFL_TEAMS[g.away_team];
  const home = NFL_TEAMS[g.home_team];

  const kickoff = new Date(g.commence_time)
    .toLocaleString("en-US",{timeZone:"America/New_York"});

  const card = document.createElement("div");
  card.className = "game-card";
  card.style.borderColor = home.primary;

  card.innerHTML = `
    <div class="game-header" style="
      background: linear-gradient(45deg, ${away.primary}, ${home.primary});
    ">
      <div class="team-row">
        <img class="team-logo" src="${away.logo}">
        <span>${g.away_team}</span>
        <span>@</span>
        <img class="team-logo" src="${home.logo}">
        <span>${g.home_team}</span>
      </div>

      <div class="ev-badge">
        EV: ${evPercent(g.bestEV)}%
      </div>

      <div class="kickoff">Kickoff: ${kickoff}</div>
    </div>

    <div class="ml-section">
      ${renderMainlines(g)}
    </div>

    <div class="props-section">
      ${renderProps(g.props)}
    </div>

    <div class="parlay-section">
      <button class="parlay-btn" onclick='addParlayLeg({
        gameId:"${g.id}",
        type:"BestEV",
        display:"${g.away_team} @ ${g.home_team}",
        odds: ${g.bestEV}
      })'>Add Best-EV Pick</button>
    </div>
  `;

  box.appendChild(card);
}

function renderMainlines(g){
  const homeML = g.ev.home !== null ?
    `${g.home_team}: ${evPercent(g.ev.home)}%` : "–";
  const awayML = g.ev.away !== null ?
    `${g.away_team}: ${evPercent(g.ev.away)}%` : "–";

  return `
    <div class="mainline-row">
      <strong>Mainline EV:</strong>
      <span>${awayML}</span>
      <span>${homeML}</span>
    </div>
  `;
}

function renderProps(props){
  if (!props || !props.length) return `<div>No props available.</div>`;

  return props.slice(0,7).map(p => `
    <div class="prop-row">
      <div class="prop-player">${p.player}</div>
      <div class="prop-metric">${p.metric.replace("player_","").replace("_"," ")}</div>
      <div class="prop-ev">EV: ${evPercent(p.bestEV)}%</div>
    </div>
  `).join("");
}
