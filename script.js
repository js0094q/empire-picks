import { NFL_TEAMS } from "./teams.js";
import { addParlayLeg, getParlay } from "./parlay.js";

const state = {
  events: [],
  search: "",
  sort: "ev-desc",
};

document.addEventListener("DOMContentLoaded", () => {
  setupControls();
  loadGames();
});

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
    "B":  "ev-B",
  }[g] || "";
}

function evPercent(val = 0) {
  return (val * 100).toFixed(1);
}

function setupControls() {
  const searchInput = document.getElementById("global-prop-search");
  const sortSelect = document.getElementById("prop-sort");
  const clearBtn = document.getElementById("clear-filters");

  if (searchInput) {
    searchInput.addEventListener("input", () => {
      state.search = searchInput.value.trim().toLowerCase();
      renderGames();
    });
  }

  if (sortSelect) {
    sortSelect.addEventListener("change", () => {
      state.sort = sortSelect.value;
      renderGames();
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener("click", () => {
      state.search = "";
      state.sort = "ev-desc";
      if (searchInput) searchInput.value = "";
      if (sortSelect) sortSelect.value = "ev-desc";
      renderGames();
    });
  }
}

async function loadGames() {
  const box = document.getElementById("games");
  box.innerHTML = "Loading...";

  try {
    const r = await fetch("/api/events");
    if (!r.ok) throw new Error("Failed loading events");

    const games = await r.json();
    state.events = games
      .map(g => ({ ...g, bestEV: g.bestEV ?? 0, props: g.props || [] }))
      .sort((a, b) => (b.bestEV || 0) - (a.bestEV || 0));

    renderGames();
    updateParlayPill();
  } catch (err) {
    console.error(err);
    box.innerHTML = "Could not load events.";
  }
}

function renderGames() {
  const box = document.getElementById("games");
  if (!state.events.length) {
    box.innerHTML = "No games available.";
    updateControlStats(0);
    return;
  }

  let visibleProps = 0;
  box.innerHTML = "";
  state.events.forEach(game => {
    const propsForCard = filterAndSortProps(game.props);
    visibleProps += propsForCard.length;
    box.appendChild(buildGameCard(game, propsForCard));
  });
  updateParlayPill();
  updateControlStats(visibleProps);
}

function buildGameCard(g, propsForCard = []) {
  const away = NFL_TEAMS[g.away_team] || {};
  const home = NFL_TEAMS[g.home_team] || {};

  const kickoff = new Date(g.commence_time)
    .toLocaleString("en-US", { timeZone: "America/New_York" });

  const bestGrade = valueGrade(g.bestEV || 0);
  const bestClass = gradeClass(bestGrade);

  const card = document.createElement("div");
  card.className = "game-card";
  card.style.borderColor = home.primary || "#444";

  const headerBg = `linear-gradient(45deg, ${away.primary || "#222"}, ${home.primary || "#222"})`;

  card.innerHTML = `
    <div class="game-header" style="background:${headerBg}">
      <div class="team-row">
        <img class="team-logo" src="${away.logo || ''}" alt="${g.away_team}">
        <span>${g.away_team}</span>
        <span>@</span>
        <img class="team-logo" src="${home.logo || ''}" alt="${g.home_team}">
        <span>${g.home_team}</span>
      </div>
      <div class="header-meta">
        <div class="ev-pill ${bestClass}">EV: ${evPercent(g.bestEV)}% • ${bestGrade}</div>
        <div class="kickoff">Kickoff: ${kickoff}</div>
      </div>
    </div>

    <div class="mainline-row">
      <div><strong>Mainline EV</strong></div>
      <div class="ev-group">
        <span class="ev-pill">${g.away_team}: ${g.ev?.away != null ? evPercent(g.ev.away)+"%" : "–"}</span>
        <span class="ev-pill">${g.home_team}: ${g.ev?.home != null ? evPercent(g.ev.home)+"%" : "–"}</span>
      </div>
    </div>

    <div class="parlay-section">
      <button class="props-btn" onclick='addParlayLeg({
        gameId:"${g.id}",
        type:"BestEV",
        display:"${g.away_team} @ ${g.home_team}",
        odds:${g.bestEV || 0}
      })'>Add Best-EV Pick</button>
    </div>

    <div class="props-section">
      <div class="props-section-title">Player Props <span class="muted">(${propsForCard.length || 0})</span></div>
      <div class="props-grid">${propsForCard.length ? propsForCard.map(p => renderProp(p, g)).join("") : `<p class="muted">No props match your filters yet.</p>`}</div>
    </div>
  `;

  return card;
}

function renderProp(p, game) {
  const grade = valueGrade(p.bestEV || 0);
  const cls = gradeClass(grade);
  const line = p.over?.point ?? p.under?.point ?? "-";
  const bestOutcome = selectBestOutcome(p);
  const bestLabel = p.bestSide ? `${p.bestSide}` : "Pick";
  const odds = bestOutcome?.price != null ? ` ${bestOutcome.price > 0 ? "+" : ""}${bestOutcome.price}` : "";
  const parlayLeg = bestOutcome ? {
    ...bestOutcome,
    gameId: game.id,
    display: `${p.player} ${bestLabel} ${formatMetric(p.metric)}`
  } : null;

  return `
    <div class="prop-chip">
      <div class="prop-chip__head">
        <div>
          <div class="prop-chip__player">${p.player}</div>
          <div class="prop-chip__metric">${formatMetric(p.metric)} • Line ${line} • Best: ${p.bestSide || "–"}</div>
        </div>
        <span class="ev-pill ${cls}">${evPercent(p.bestEV || 0)}% • ${grade}</span>
      </div>
      <div class="prop-chip__actions">
        <span class="book-tag">${bestOutcome?.book ? `@ ${bestOutcome.book}` : "Best price"}</span>
        <button class="props-btn" ${parlayLeg ? "" : "disabled"} onclick='addParlayLeg(${JSON.stringify(parlayLeg || {})})'>Add ${bestLabel}${odds}</button>
      </div>
    </div>
  `;
}

function selectBestOutcome(p) {
  if (!p) return null;
  if ((p.bestSide || "").toLowerCase() === "over") return p.over || null;
  if ((p.bestSide || "").toLowerCase() === "under") return p.under || null;
  return p.over || p.under || null;
}

function filterAndSortProps(props = []) {
  const filtered = props.filter(p => {
    if (!state.search) return true;
    const text = `${p.player} ${p.metric}`.toLowerCase();
    return text.includes(state.search);
  });

  const sorter = {
    "ev-desc": (a, b) => (b.bestEV || 0) - (a.bestEV || 0),
    "player-asc": (a, b) => a.player.localeCompare(b.player),
    "line-asc": (a, b) => (a.over?.point ?? a.under?.point ?? Infinity) - (b.over?.point ?? b.under?.point ?? Infinity),
  }[state.sort] || (() => 0);

  return filtered.sort(sorter);
}

function formatMetric(metric = "") {
  return metric.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

function updateControlStats(visibleProps) {
  const stats = document.getElementById("prop-stats");
  if (!stats) return;

  const totalGames = state.events.length;
  const propsLabel = visibleProps === 1 ? "prop" : "props";
  stats.textContent = `${visibleProps} ${propsLabel} across ${totalGames} game${totalGames === 1 ? "" : "s"}`;
}

function updateParlayPill() {
  const count = getParlay().length;
  const pill = document.getElementById("parlay-count");
  pill.innerText = count;
}
