import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

/*
  Percentile-based strength.
  This prevents everything from being VSTR.
*/
function strengthFromDistribution(ev, evs) {
  if (ev == null || !evs.length) return { cls: "strength-weak", txt: "WEAK" };

  const sorted = [...evs].sort((a, b) => a - b);
  const rank = sorted.indexOf(ev) / (sorted.length - 1 || 1);

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
   MAIN MARKET ROW
   ========================================================= */

function renderMarketRows(marketType, label, options) {
  if (!Array.isArray(options) || !options.length) return "";

  // sort by EV descending, take top 3
  const sorted = [...options]
    .filter(o => o.ev != null)
    .sort((a, b) => b.ev - a.ev)
    .slice(0, 3);

  const evs = sorted.map(o => o.ev);

  return sorted.map(o => {
    const s = strengthFromDistribution(o.ev, evs);

    return `
      <div class="market-row">
        <span class="market-tag ${marketType}">${label}</span>

        <div class="market-main">
          <div class="market-name">${o.name}</div>
          <div class="market-odds">${fmtOdds(o.odds)}</div>
          <div class="market-meta">
            Market ${pct(o.implied)} · Consensus ${pct(o.consensus_prob)}
          </div>
        </div>

        <div class="strength-bubble ${s.cls}">${s.txt}</div>
        <button class="parlay-btn">+ Parlay</button>
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
      .filter(p => p.over_ev != null || p.under_ev != null)
      .flatMap(p => {
        const sides = [];

        if (p.over_ev != null) {
          sides.push({
            side: "Over",
            ev: p.over_ev,
            odds: p.over_odds
          });
        }
        if (p.under_ev != null) {
          sides.push({
            side: "Under",
            ev: p.under_ev,
            odds: p.under_odds
          });
        }

        // sort by EV, take top 2 sides per prop
        return sides
          .sort((a, b) => b.ev - a.ev)
          .slice(0, 2)
          .map(s => ({ ...s, player: p.player, point: p.point, label: p.label }));
      })
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 3); // top 3 props per category

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
              <button class="parlay-btn">+ Parlay</button>
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
          <img src="${away.logo}" />
          <span>@</span>
          <img src="${home.logo}" />
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>

      <button class="props-toggle">Show Props</button>

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
    const btn = e.target.closest(".props-toggle");
    if (!btn) return;

    const card = btn.closest(".game-card");
    const propsEl = card.querySelector(".props-container");
    const gameId = card.dataset.gameId;

    if (propsEl.classList.contains("open")) {
      propsEl.classList.remove("open");
      btn.textContent = "Show Props";
      return;
    }

    btn.textContent = "Loading Props…";
    propsEl.classList.add("open");

    try {
      const data = await fetchProps(gameId);
      renderProps(propsEl, data.categories);
      btn.textContent = "Hide Props";
    } catch {
      propsEl.innerHTML = `<div class="muted">Failed to load props.</div>`;
      btn.textContent = "Show Props";
    }
  });
});
