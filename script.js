// script.js
import { Teams } from "./teams.js";

/* =========================================================
   UTILITIES
   ========================================================= */

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null ? "—" : o > 0 ? `+${o}` : `${o}`;

function impliedFromOdds(o) {
  if (o == null) return null;
  return o > 0
    ? 100 / (o + 100)
    : Math.abs(o) / (Math.abs(o) + 100);
}

/*
  Percentile-based value signal
*/
function valueSignal(ev, distribution) {
  if (ev == null || distribution.length < 2) {
    return { cls: "signal-weak", txt: "MIN" };
  }

  const sorted = [...distribution].sort((a, b) => a - b);
  const rank = sorted.lastIndexOf(ev) / (sorted.length - 1);

  if (rank >= 0.9) return { cls: "signal-very-strong", txt: "HIGH" };
  if (rank >= 0.7) return { cls: "signal-strong", txt: "MED" };
  if (rank >= 0.4) return { cls: "signal-moderate", txt: "LOW" };
  return { cls: "signal-weak", txt: "MIN" };
}

function stabilityLabel(v) {
  if (v == null) return "—";
  if (v >= 0.85) return "High";
  if (v >= 0.7) return "Medium";
  return "Low";
}

/* =========================================================
   FETCH
   ========================================================= */

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to fetch games");
  return r.json();
}

async function fetchProps(gameId) {
  const r = await fetch(`/api/props?id=${encodeURIComponent(gameId)}`);
  if (!r.ok) throw new Error("Failed to fetch props");
  return r.json();
}

/* =========================================================
   GAME SUMMARY (MARKET LEAN + VALUE)
   ========================================================= */

function buildSummary(game) {
  const candidates = [];

  const push = (label, side) => {
    if (!side) return;
    candidates.push({
      label,
      prob: side.consensus_prob,
      ev: side.ev,
      stability: side.stability
    });
  };

  const h2h = game.markets?.h2h;
  if (h2h) {
    for (const book in h2h) {
      h2h[book].forEach(o => {
        if (o.name === game.home_team) push(game.home_team, o);
        if (o.name === game.away_team) push(game.away_team, o);
      });
      break;
    }
  }

  if (!candidates.length) return "";

  const lean = [...candidates].sort((a, b) => b.prob - a.prob)[0];
  const value = [...candidates]
    .filter(x => x.ev != null)
    .sort((a, b) => b.ev - a.ev)[0];

  const avgStability =
    candidates
      .map(x => x.stability)
      .filter(v => v != null)
      .reduce((a, b) => a + b, 0) /
      candidates.filter(x => x.stability != null).length || null;

  return `
    <div class="game-summary">
      <div class="summary-item">
        <span class="badge badge-lean">Market Lean</span>
        ${lean.label} (${pct(lean.prob)})
      </div>

      <div class="summary-item">
        <span class="badge badge-value">Best Value</span>
        ${value && value.ev > 0
          ? `${value.label} (${(value.ev * 100).toFixed(1)}%)`
          : "—"}
      </div>

      <div class="summary-item">
        <span class="badge badge-stability">Consensus</span>
        ${stabilityLabel(avgStability)}
      </div>
    </div>
  `;
}

/* =========================================================
   MARKET RENDERING (ML ONLY FOR NOW)
   ========================================================= */

function renderMoneyline(game) {
  const rows = [];
  const market = game.markets?.h2h;
  if (!market) return "";

  for (const book in market) {
    market[book].forEach(o => {
      rows.push({
        team: o.name,
        odds: o.odds,
        prob: o.prob,
        ev: o.ev
      });
    });
  }

  if (!rows.length) return "";

  const evs = rows.map(r => r.ev).filter(v => v != null);
  const maxEv = evs.length ? Math.max(...evs) : null;

  return rows.map(r => {
    const sig = valueSignal(r.ev, evs);
    const best = r.ev === maxEv && maxEv > 0;

    return `
      <div class="market-row ${best ? "best-value" : ""}">
        <span class="market-tag ml">ML</span>

        <div class="market-main">
          <div class="market-name">
            ${r.team}
            ${best ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
          </div>

          <div class="market-odds">${fmtOdds(r.odds)}</div>

          <div class="market-meta">
            Books ${pct(impliedFromOdds(r.odds))}
            · Consensus ${pct(r.prob)}
            · Value ${(r.ev * 100).toFixed(1)}%
          </div>
        </div>

        <div class="signal-bubble ${sig.cls}">${sig.txt}</div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   PROPS
   ========================================================= */

function renderProps(container, data) {
  const markets = data.markets;
  if (!markets || !Object.keys(markets).length) {
    container.innerHTML = `<div class="muted">No props available.</div>`;
    return;
  }

  container.innerHTML = Object.entries(markets).map(([mkt, props]) => {
    return `
      <div class="props-category">
        <div class="props-category-title">${mkt.replace(/_/g, " ")}</div>

        ${props.map(p => {
          const rows = [
            { side: "Over", ...p.over },
            { side: "Under", ...p.under }
          ];

          const evs = rows.map(r => r.ev).filter(v => v != null);
          const maxEv = evs.length ? Math.max(...evs) : null;

          return rows.map(r => {
            const sig = valueSignal(r.ev, evs);
            const best = r.ev === maxEv && maxEv > 0;

            return `
              <div class="prop-row">
                <div>
                  <div class="prop-player">${p.player}</div>
                  <div class="prop-line">
                    ${r.side} ${p.point}
                    ${best ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
                  </div>
                  <div class="market-meta">
                    Consensus ${pct(r.prob)}
                    · Value ${(r.ev * 100).toFixed(1)}%
                  </div>
                </div>

                <div class="prop-right">
                  <div class="signal-bubble ${sig.cls}">${sig.txt}</div>
                  <div class="prop-odds">${fmtOdds(r.odds)}</div>
                </div>
              </div>
            `;
          }).join("");
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

      ${buildSummary(game)}

      ${renderMoneyline(game)}

      <button class="props-toggle">Show Props</button>
      <div class="props-container"></div>

      <div class="muted" style="margin-top:8px;font-size:0.75rem">
        Value signals reflect pricing inefficiency, not outcome certainty.
      </div>
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");

  try {
    const games = (await fetchGames()).sort(
      (a, b) => new Date(a.commence_time) - new Date(b.commence_time)
    );

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
        renderProps(propsEl, data);
        btn.textContent = "Hide Props";
      } catch {
        propsEl.innerHTML = `<div class="muted">Failed to load props.</div>`;
        btn.textContent = "Show Props";
      }
    });
  } catch (err) {
    container.innerHTML = `<div class="muted">Failed to load games.</div>`;
    console.error(err);
  }
});
