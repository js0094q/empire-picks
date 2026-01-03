// script.js
import { Teams } from "./teams.js";

/* =========================================================
   SIMPLE FORMATTERS (NO LOGIC)
   ========================================================= */

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null ? "—" : o > 0 ? `+${o}` : `${o}`;

/* =========================================================
   FETCH
   ========================================================= */

const fetchGames = async () => {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to load games");
  return r.json();
};

const fetchProps = async id => {
  const r = await fetch(`/api/props?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("Failed to load props");
  return r.json();
};

/* =========================================================
   MARKET RENDERERS (DISPLAY ONLY)
   ========================================================= */

function renderMarket(tag, rows) {
  if (!rows.length) return "";

  return rows.map(r => `
    <div class="market-row">
      <span class="market-tag">${tag}</span>

      <div class="market-main">
        <div class="market-name">${r.label}</div>
        <div class="market-odds">${fmtOdds(r.odds)}</div>

        <div class="market-meta">
          Consensus ${pct(r.prob)}
          ${r.ev != null ? `· EV ${(r.ev * 100).toFixed(1)}%` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

function collectMarket(game, marketKey, formatter) {
  const out = [];
  const market = game.markets?.[marketKey];
  if (!market) return out;

  Object.values(market).forEach(book => {
    book.forEach(o => {
      out.push({
        label: formatter(o),
        odds: o.odds,
        prob: o.consensus_prob,
        ev: o.ev
      });
    });
  });

  return out;
}

/* =========================================================
   PROPS (DISPLAY ONLY)
   ========================================================= */

function renderProps(container, data) {
  if (!data?.markets) {
    container.innerHTML = `<div class="muted">No props available.</div>`;
    return;
  }

  container.innerHTML = Object.entries(data.markets).map(([k, props]) => `
    <div class="props-category">
      <div class="props-category-title">
        ${k.replace(/_/g, " ")}
      </div>

      ${props.flatMap(p => {
        const rows = [
          { side: "Over", ...p.over },
          { side: "Under", ...p.under }
        ];

        return rows.map(r => `
          <div class="prop-row">
            <div>
              <div class="prop-player">${p.player}</div>
              <div class="prop-line">
                ${r.side} ${p.point}
              </div>
              <div class="market-meta">
                Consensus ${pct(r.prob)}
                ${r.ev != null ? `· EV ${(r.ev * 100).toFixed(1)}%` : ""}
              </div>
            </div>

            <div class="prop-right">
              <div class="prop-odds">${fmtOdds(r.odds)}</div>
            </div>
          </div>
        `);
      }).join("")}
    </div>
  `).join("");
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

  const ml = collectMarket(game, "h2h", o => o.name);
  const spread = collectMarket(
    game,
    "spreads",
    o => `${o.name} ${o.point > 0 ? "+" : ""}${o.point}`
  );
  const total = collectMarket(
    game,
    "totals",
    o => `${o.name} ${o.point}`
  );

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

      ${renderMarket("ML", ml)}
      ${renderMarket("SPREAD", spread)}
      ${renderMarket("TOTAL", total)}

      <button class="props-toggle">Show Props</button>
      <div class="props-container"></div>

      <div class="muted" style="margin-top:8px;font-size:0.75rem">
        Props and markets shown without client-side ranking.
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
