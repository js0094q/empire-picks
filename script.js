import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

const strengthFromEV = ev => {
  if (ev > 0.08) return { cls: "strength-very-strong", txt: "VSTR" };
  if (ev > 0.04) return { cls: "strength-strong", txt: "STR" };
  if (ev > 0.015) return { cls: "strength-moderate", txt: "MOD" };
  return { cls: "strength-weak", txt: "WEAK" };
};

const propStrengthFromEV = ev => {
  if (ev > 0.18) return { cls: "strength-very-strong", txt: "VSTR" };
  if (ev > 0.12) return { cls: "strength-strong", txt: "STR" };
  if (ev > 0.07) return { cls: "strength-moderate", txt: "MOD" };
  return { cls: "strength-weak", txt: "WEAK" };
};

const evText = ev => (ev == null ? "EV —" : `EV ${(ev * 100).toFixed(1)}%`);

/* =========================================================
   FETCH
   ========================================================= */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to load games");
  return r.json();
}

async function fetchProps(gameId) {
  const r = await fetch(`/api/props?id=${encodeURIComponent(gameId)}`);
  if (!r.ok) throw new Error("Failed to load props");
  return r.json();
}

/* =========================================================
   MAIN MARKET ROW
   ========================================================= */

function marketRow({ marketType, label, name, odds, bookProb, modelProb, ev }) {
  const strength = strengthFromEV(ev);

  return `
    <div class="market-row">
      <span class="market-tag ${marketType}">${label}</span>

      <div class="market-main">
        <div class="market-name">${name}</div>
        <div class="market-odds">${fmtOdds(odds)}</div>
        <div class="market-meta">
          Book ${pct(bookProb)} · Model ${pct(modelProb)}
        </div>
      </div>

      <div class="strength-bubble ${strength.cls}">${strength.txt}</div>

      <button class="parlay-btn" data-leg='${encodeURIComponent(JSON.stringify({
        type: marketType,
        label,
        name,
        odds
      }))}'>+ Parlay</button>
    </div>
  `;
}

/* =========================================================
   PROPS RENDERING
   ========================================================= */

function propRow({ player, label, point, side, odds, ev }) {
  const strength = propStrengthFromEV(ev);

return `
  <div class="prop-row">
    <div class="prop-left">
      <div class="prop-player">${player}</div>
      <div class="prop-line">
        <span class="${sideCls}">${side}</span>
        <span class="prop-point">${point ?? ""}</span>
        <span class="prop-label">${label ?? ""}</span>
      </div>
    </div>

    <div class="prop-right">
      <div class="strength-bubble ${strength.cls}">
        ${strength.txt}
      </div>

      <span class="prop-odds">${fmtOdds(odds)}</span>
      <span class="prop-ev">${evText(ev)}</span>

      <button class="parlay-btn">+ Parlay</button>
    </div>
  </div>
`;
   
function renderPropsInto(containerEl, categories) {
  const cats = categories || {};
  const keys = Object.keys(cats);

  if (!keys.length) {
    containerEl.innerHTML = `<div class="muted">No props available yet.</div>`;
    return;
  }

  const html = keys.map(catName => {
    const items = Array.isArray(cats[catName]) ? cats[catName] : [];
    if (!items.length) return "";

    // items are already sorted by best EV in /api/props.js  [oai_citation:1‡props.js](file-service://file-SZhk2JnhHwEpQ2ABMSUaLJ)
    const rows = items.flatMap(p => {
      const out = [];

      // Choose best side first, but show only one row per prop entry (minimal clutter)
      const overEv = p.over_ev ?? -999;
      const underEv = p.under_ev ?? -999;

      const bestSide = overEv >= underEv ? "Over" : "Under";
      const bestOdds = bestSide === "Over" ? p.over_odds : p.under_odds;
      const bestEv = bestSide === "Over" ? p.over_ev : p.under_ev;

      out.push(propRow({
        player: p.player,
        label: p.label,
        point: p.point,
        side: bestSide,
        odds: bestOdds,
        ev: bestEv
      }));

      return out;
    }).join("");

    return `
      <div class="props-category">
        <div class="props-category-title">${catName}</div>
        <div class="props-rows">${rows}</div>
      </div>
    `;
  }).join("");

  containerEl.innerHTML = html || `<div class="muted">No props available yet.</div>`;
}

/* =========================================================
   GAME CARD
   ========================================================= */

function gameCard(game) {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const kickoff = new Date(game.commence_time).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });

  let html = `
    <div class="game-card" data-game-id="${game.id}">
      <div class="game-header">
        <div class="teams">
          <img src="${away?.logo || ""}" alt="${game.away_team}" />
          <span>@</span>
          <img src="${home?.logo || ""}" alt="${game.home_team}" />
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>

      <button class="props-toggle" data-game-id="${game.id}">Show Props</button>

      <div class="markets-row">
        <div class="market-box">
  `;

  /* ---------------- MONEYLINE ---------------- */
  if (game.best?.ml) {
    if (game.best.ml.away) {
      html += marketRow({
        marketType: "ml",
        label: "ML",
        name: game.away_team,
        odds: game.best.ml.away.odds,
        bookProb: game.best.ml.away.implied,
        modelProb: game.best.ml.away.consensus_prob,
        ev: game.best.ml.away.ev
      });
    }

    if (game.best.ml.home) {
      html += marketRow({
        marketType: "ml",
        label: "ML",
        name: game.home_team,
        odds: game.best.ml.home.odds,
        bookProb: game.best.ml.home.implied,
        modelProb: game.best.ml.home.consensus_prob,
        ev: game.best.ml.home.ev
      });
    }
  }

  /* ---------------- SPREAD ---------------- */
  if (game.best?.spread) {
    if (game.best.spread.away) {
      html += marketRow({
        marketType: "spread",
        label: "SPREAD",
        name: `${game.away_team} ${game.best.spread.away.point}`,
        odds: game.best.spread.away.odds,
        bookProb: game.best.spread.away.implied,
        modelProb: game.best.spread.away.consensus_prob,
        ev: game.best.spread.away.ev
      });
    }

    if (game.best.spread.home) {
      html += marketRow({
        marketType: "spread",
        label: "SPREAD",
        name: `${game.home_team} ${game.best.spread.home.point}`,
        odds: game.best.spread.home.odds,
        bookProb: game.best.spread.home.implied,
        modelProb: game.best.spread.home.consensus_prob,
        ev: game.best.spread.home.ev
      });
    }
  }

  /* ---------------- TOTALS ---------------- */
  if (game.best?.total) {
    if (game.best.total.over) {
      html += marketRow({
        marketType: "total",
        label: "TOTAL",
        name: `Over ${game.best.total.over.point}`,
        odds: game.best.total.over.odds,
        bookProb: game.best.total.over.implied,
        modelProb: game.best.total.over.consensus_prob,
        ev: game.best.total.over.ev
      });
    }

    if (game.best.total.under) {
      html += marketRow({
        marketType: "total",
        label: "TOTAL",
        name: `Under ${game.best.total.under.point}`,
        odds: game.best.total.under.odds,
        bookProb: game.best.total.under.implied,
        modelProb: game.best.total.under.consensus_prob,
        ev: game.best.total.under.ev
      });
    }
  }

  html += `
        </div>
      </div>

      <div class="props-container"></div>
    </div>
  `;

  return html;
}

/* =========================================================
   BOOTSTRAP + EVENTS
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  const refreshBtn = document.getElementById("refresh-btn");

  async function load() {
    container.innerHTML = "<div class='loading'>Loading games…</div>";
    try {
      const games = await fetchGames();
      container.innerHTML = games.map(gameCard).join("");
    } catch (e) {
      container.innerHTML = "<div class='muted'>Failed to load games.</div>";
      console.error(e);
    }
  }

  refreshBtn?.addEventListener("click", load);

  // Props toggle handler
  container.addEventListener("click", async e => {
    const btn = e.target.closest(".props-toggle");
    if (!btn) return;

    const gameId = btn.dataset.gameId;
    const card = btn.closest(".game-card");
    const propsEl = card?.querySelector(".props-container");
    if (!propsEl) return;

    const isOpen = propsEl.classList.contains("open");

    // Close if open
    if (isOpen) {
      propsEl.classList.remove("open");
      btn.textContent = "Show Props";
      return;
    }

    // Open and load
    propsEl.classList.add("open");
    btn.textContent = "Loading Props…";

    try {
      const data = await fetchProps(gameId);
      renderPropsInto(propsEl, data?.categories);
      btn.textContent = "Hide Props";
    } catch (err) {
      propsEl.innerHTML = `<div class="muted">Props failed to load.</div>`;
      btn.textContent = "Show Props";
      console.error(err);
    }
  });

  await load();
});
