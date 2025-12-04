import { NFL_TEAMS } from "./teams.js";
import { addParlayLeg, getParlay, saveParlay } from "./parlay.js";

function valueGrade(ev) {
  if (ev >= 0.10) return "A+";
  if (ev >= 0.06) return "A";
  if (ev >= 0.03) return "B+";
  if (ev >= 0.01) return "B";
  return "C";
}

function gradeClass(g) {
  return {
    "A+": "ev-Aplus",
    "A":  "ev-A",
    "B+": "ev-Bplus",
    "B":  "ev-B"
  }[g] || "";
}

function evPercent(val) {
  return (val * 100).toFixed(1);
}

let allEvents = [];

document.addEventListener("DOMContentLoaded", loadGames);

async function loadGames() {
  const box = document.getElementById("games");
  box.innerHTML = "Loading...";

  const r = await fetch("/api/events");
  if (!r.ok) {
    box.innerHTML = "Failed loading events.";
    return;
  }

  const games = await r.json();
  window.__allEvents = games;  // store globally for modal lookup
  allEvents = games;

  box.innerHTML = "";
  games.sort((a, b) => (b.bestEV || 0) - (a.bestEV || 0));

  games.forEach(g => renderGame(g, box));
  updateParlayPill();
}

function renderGame(g, box) {
  const away = NFL_TEAMS[g.away_team] || {};
  const home = NFL_TEAMS[g.home_team] || {};

  const kickoff = new Date(g.commence_time)
    .toLocaleString("en-US", { timeZone: "America/New_York" });

  const evDisplay = g.bestEV != null
    ? `${evPercent(g.bestEV)}%` : "–";

  const headerBg = `linear-gradient(45deg, ${away.primary||"#222"}, ${home.primary||"#222"})`;

  const card = document.createElement("div");
  card.className = "game-card";
  card.style.borderColor = home.primary || "#444";

  card.innerHTML = `
    <div class="game-header" style="background:${headerBg}">
      <div class="team-row">
        <img class="team-logo" src="${away.logo || ''}" alt="${g.away_team}">
        <span>${g.away_team}</span>
        <span>@</span>
        <img class="team-logo" src="${home.logo || ''}" alt="${g.home_team}">
        <span>${g.home_team}</span>
      </div>

      <div class="ev-badge">EV: ${evDisplay}</div>
      <div class="kickoff">Kickoff: ${kickoff}</div>
    </div>

    <div class="mainline-row">
      <strong>Mainline EV:</strong>
      <span>${g.away_team}: ${g.ev.away != null ? evPercent(g.ev.away)+"%" : "–" }</span>
      <span>${g.home_team}: ${g.ev.home != null ? evPercent(g.ev.home)+"%" : "–" }</span>
    </div>

    <button class="props-btn" onclick="openPropsModal('${g.id}')">
      ➤ View Player Props
    </button>

    <div class="parlay-section">
      <button class="props-btn" onclick='addParlayLeg({
        gameId:"${g.id}",
        type:"BestEV",
        display:"${g.away_team} @ ${g.home_team}",
        odds: ${g.bestEV || 0}
      })'>Add Best-EV Pick</button>
    </div>
  `;

  box.appendChild(card);
}

// ========== PROP MODAL LOGIC ==========

const modal = document.getElementById("props-modal");
const closeModal = document.getElementById("close-props");
const propsContainer = document.getElementById("props-container");
const searchBox = document.getElementById("prop-search");

let currentProps = [];

window.openPropsModal = function(eventId) {
  const game = window.__allEvents.find(ev => ev.id === eventId);
  const props = game?.props || [];

  if (!props.length) {
    propsContainer.innerHTML = `<p>No props available.</p>`;
  } else {
    currentProps = props;
    renderProps(props);
  }

  modal.classList.remove("hidden");
};

closeModal.onclick = () => modal.classList.add("hidden");

searchBox.addEventListener("input", () => {
  const q = searchBox.value.toLowerCase();
  const filtered = currentProps.filter(p => p.player.toLowerCase().includes(q));
  renderProps(filtered);
});

function renderProps(list) {
  propsContainer.innerHTML = list.map(p => {
    const g = valueGrade(p.bestEV);
    const cls = gradeClass(g);
    return `
      <div class="prop-card">
        <div class="prop-title">
          ${p.player} — ${p.metric}
          <span class="ev-badge ${cls}">${evPercent(p.bestEV)}% • ${g}</span>
        </div>
        <div class="prop-line">Line: ${p.point ?? "-"}</div>
        <div style="margin-top:8px;">
          <button onclick='addParlayLeg(${JSON.stringify(p.over || p.under)})' class="props-btn">
            Add to Parlay
          </button>
        </div>
      </div>
    `;
  }).join("");
}

function updateParlayPill() {
  const count = getParlay().length;
  const pill = document.getElementById("parlay-count");
  pill.innerText = count;
}
