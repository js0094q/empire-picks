import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

const impliedFromOdds = o => {
  if (o == null) return null;
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
};

/*
  Percentile-based strength within cohort
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
   MAIN MARKET RENDERING
   ========================================================= */

function formatMarketLabel(type, o) {
  if (type === "ml") return o.team;
  if (type === "spread") {
    const sign = o.point > 0 ? "+" : "";
    return `${o.team} ${sign}${o.point}`;
  }
  if (type === "total") return `${o.side} ${o.point}`;
  return "—";
}

function renderMarketRows(marketType, label, options) {
  if (!Array.isArray(options)) return "";

  const viable = options.filter(o => o && o.odds != null && o.consensus_prob != null);
  if (!viable.length) return "";

  // Always show both sides, sorted by EV
  const sorted = viable.sort((a, b) => (b.ev ?? -999) - (a.ev ?? -999));
  const shown = sorted.slice(0, 2);

  const evs = shown.map(o => o.ev).filter(v => v != null);

  return shown.map(o => {
    const marketProb = o.implied ?? impliedFromOdds(o.odds);
    const s = strengthFromDistribution(o.ev, evs);

    return `
      <div class="market-row">
        <span class="market-tag ${marketType}">${label}</span>

        <div class="market-main">
          <div class="market-name">${formatMarketLabel(marketType, o)}</div>
          <div class="market-odds">${fmtOdds(o.odds)}</div>
          <div class="market-meta">
            Market ${pct(marketProb)}
            · Consensus ${pct(o.consensus_prob)}
            · EV ${(o.ev * 100).toFixed(1)}%
          </div>
        </div>

        <div class="strength-bubble ${s.cls}">${s.txt}</div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   PROPS RENDERING (unchanged, already correct)
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
        const out = [];

        if (p.over_ev != null) {
          out.push({
            side: "Over",
            ev: p.over_ev,
            prob: p.over_prob,
            odds: p.over_odds,
            market: p.over_list?.length
              ? p.over_list.reduce((a,b)=>a+b.p,0)/p.over_list.length
              : null,
            player: p.player,
            point: p.point,
            label: p.label
          });
        }

        if (p.under_ev != null) {
          out.push({
            side: "Under",
            ev: p.under_ev,
            prob: p.under_prob,
            odds: p.under_odds,
            market: p.under_list?.length
              ? p.under_list.reduce((a,b)=>a+b.p,0)/p.under_list.length
              : null,
            player: p.player,
            point: p.point,
            label: p.label
          });
        }

        return out;
      })
      .sort((a, b) => b.ev - a.ev)
      .slice(0, 4);

    if (!rows.length) return "";

    const evs = rows.map(r => r.ev);

    return `
      <div class="props-category">
        <div class="props-category-title">${cat}</div>

        ${rows.map(r => {
          const s = strengthFromDistribution(r.ev, evs);

          return `
            <div class="prop-row">
              <div class="prop-left">
                <div class="prop-player">${r.player}</div>
                <div class="prop-line">
                  ${r.side} ${r.point} ${r.label}
                </div>
                <div class="market-meta">
                  Market ${pct(r.market)}
                  · Consensus ${pct(r.prob)}
                  · EV ${(r.ev * 100).toFixed(1)}%
                </div>
              </div>

              <div class="prop-right">
                <div class="strength-bubble ${s.cls}">${s.txt}</div>
                <span class="prop-odds">${fmtOdds(r.odds)}</span>
              </div>
            </div>
          `;
        }).join("")}
      </div>
    `;
  }).join("");
}

/* =========================================================
   GAME CARD + BOOTSTRAP (unchanged)
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

      <button class="props-toggle">Show Props</button>

      ${renderMarketRows("ml", "ML", [
        { ...game.best?.ml?.away, team: game.away_team },
        { ...game.best?.ml?.home, team: game.home_team }
      ])}

      ${renderMarketRows("spread", "SPREAD", [
        { ...game.best?.spread?.away, team: game.away_team },
        { ...game.best?.spread?.home, team: game.home_team }
      ])}

      ${renderMarketRows("total", "TOTAL", [
        { ...game.best?.total?.over, side: "Over" },
        { ...game.best?.total?.under, side: "Under" }
      ])}

      <div class="props-container"></div>
    </div>
  `;
}

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
