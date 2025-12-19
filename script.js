import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

/*
  Percentile-based strength within a comparable cohort.
*/
function strengthFromDistribution(ev, evs) {
  if (ev == null || evs.length < 2) {
    return { cls: "strength-weak", txt: "WEAK" };
  }

  const sorted = [...evs].sort((a, b) => a - b);
  const idx = sorted.lastIndexOf(ev);
  const rank = idx / (sorted.length - 1);

  if (rank >= 0.9) return { cls: "strength-very-strong", txt: "VSTR" };
  if (rank >= 0.7) return { cls: "strength-strong", txt: "STR" };
  if (rank >= 0.4) return { cls: "strength-moderate", txt: "MOD" };
  return { cls: "strength-weak", txt: "WEAK" };
}

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () => {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to load games");
  return r.json();
};

const fetchProps = async gameId => {
  const r = await fetch(`/api/props?id=${encodeURIComponent(gameId)}`);
  if (!r.ok) throw new Error("Failed to load props");
  return r.json();
};

/* =========================================================
   BET LABEL CONSTRUCTION (CRITICAL)
   ========================================================= */

function formatBetLabel(marketType, o) {
  if (marketType === "ml") {
    return o.name;
  }

  if (marketType === "spread") {
    const sign = o.point > 0 ? "+" : "";
    return `${o.name} ${sign}${o.point}`;
  }

  if (marketType === "total") {
    return `${o.name} ${o.point}`;
  }

  return o.name;
}

/* =========================================================
   MAIN MARKET RENDERING
   ========================================================= */

function renderMarketRows(marketType, label, options) {
  if (!Array.isArray(options)) return "";

  const viable = options.filter(o => o?.ev != null && o?.odds != null);

  if (!viable.length) return "";

  const sorted = viable.sort((a, b) => b.ev - a.ev);
  const positive = sorted.filter(o => o.ev > 0);
  const shown = (positive.length ? positive : sorted).slice(0, 2);
  const evs = shown.map(o => o.ev);

  return shown.map(o => {
    const s = strengthFromDistribution(o.ev, evs);
    const betLabel = formatBetLabel(marketType, o);

    return `
      <div class="market-row">
        <span class="market-tag ${marketType}">${label}</span>

        <div class="market-main">
          <div class="market-name">${betLabel}</div>
          <div class="market-odds">${fmtOdds(o.odds)}</div>
          <div class="market-meta">
            Book ${pct(o.implied)} · Consensus ${pct(o.consensus_prob)}
          </div>
        </div>

        <div class="strength-bubble ${s.cls}">${s.txt}</div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   PROPS RENDERING
   ========================================================= */

function renderProps(container, categories) {
  if (!categories || !Object.keys(categories).length) {
    container.innerHTML = `<div class="muted">No props available.</div>`;
    return;
  }

  container.innerHTML = Object.entries(categories).map(([cat, props]) => {
    if (!Array.isArray(props) || !props.length) return "";

    const rows = props
      .flatMap(p => {
        const sides = [];

        if (p.over_ev != null && p.over_ev > 0) {
          sides.push({
            side: "Over",
            ev: p.over_ev,
            odds: p.over_odds,
            player: p.player,
            point: p.point,
            label: p.label
          });
        }

        if (p.under_ev != null && p.under_ev > 0) {
          sides.push({
            side: "Under",
            ev: p.under_ev,
            odds: p.under_odds,
            player: p.player,
            point: p.point,
            label: p.label
          });
        }

        return sides;
      })
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 3);

    if (!rows.length) return "";

    const evs = rows.map(r => r.ev);

    return `
      <div class="props-category">
        <div class="props-category-title">${cat}</div>

        ${rows.map(r => {
          const s = strengthFromDistribution(r.ev, evs);

          return `
            <div class="prop-row">
              <div>
                <div class="prop-player">${r.player}</div>
                <div class="prop-line">
                  ${r.side} ${r.point} ${r.label}
                </div>
              </div>

              <div class="strength-bubble ${s.cls}">${s.txt}</div>
              <span class="prop-odds">${fmtOdds(r.odds)}</span>
              <span class="prop-ev">EV ${(r.ev * 100).toFixed(1)}%</span>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }).join("");
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

  return `
    <div class="game-card" data-game-id="${game.id}">
      <div class="game-header">
        <div class="teams">
          <img src="${away?.logo || ""}" />
          <span>@</span>
          <img src="${home?.logo || ""}" />
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>

      ${renderMarketRows("ml", "ML", Object.values(game.best?.ml || {}))}
      ${renderMarketRows("spread", "SPREAD", Object.values(game.best?.spread || {}))}
      ${renderMarketRows("total", "TOTAL", Object.values(game.best?.total || {}))}

      <div class="props-container"></div>
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");

  const games = (await fetchGames())
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

  container.innerHTML = games.map(gameCard).join("");

  container.addEventListener("click", async e => {
    const card = e.target.closest(".game-card");
    if (!card) return;

    const propsEl = card.querySelector(".props-container");
    const gameId = card.dataset.gameId;

    if (propsEl.classList.contains("open")) {
      propsEl.classList.remove("open");
      propsEl.innerHTML = "";
      return;
    }

    propsEl.classList.add("open");
    propsEl.innerHTML = `<div class="loading">Loading props…</div>`;

    try {
      const data = await fetchProps(gameId);
      renderProps(propsEl, data.categories);
    } catch {
      propsEl.innerHTML = `<div class="muted">Failed to load props.</div>`;
    }
  });
});
