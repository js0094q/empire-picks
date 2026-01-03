import { Teams } from "./teams.js";

/* ===============================
   FORMATTERS
   =============================== */

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`;

/* ===============================
   FETCH GAMES (FAIL-SAFE)
   =============================== */

async function fetchGames() {
  try {
    const r = await fetch("/api/events", { cache: "no-store" });
    const text = await r.text();
    const data = JSON.parse(text);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

/* ===============================
   MARKET HELPERS
   =============================== */

function renderMarket(title, rows) {
  if (!rows.length) return "";

  return rows
    .map(
      r => `
      <div class="market-row">
        <span class="market-tag">${title}</span>
        <div class="market-main">
          <div class="market-name">${r.label}</div>
          <div class="market-odds">${fmtOdds(r.odds)}</div>
          <div class="market-meta">
            Consensus ${pct(r.prob)}
            ${r.ev != null ? ` · EV ${(r.ev * 100).toFixed(1)}%` : ""}
          </div>
        </div>
      </div>
    `
    )
    .join("");
}

function collectMarket(game, key, formatter) {
  const market = game?.markets?.[key];
  if (!market) return [];

  const out = [];
  Object.values(market).forEach(bookRows => {
    if (!Array.isArray(bookRows)) return;
    bookRows.forEach(o => {
      out.push({
        label: formatter(o),
        odds: o.odds,
        prob: o.consensus_prob ?? null,
        ev: o.ev ?? null
      });
    });
  });

  return out;
}

/* ===============================
   GAME CARD (PROPS LINK FIXED)
   =============================== */

function gameCard(game) {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const kickoff = new Date(game.commence_time).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });

  const ml = collectMarket(game, "h2h", o => o.name);
  const spread = collectMarket(game, "spreads", o =>
    `${o.name} ${o.point > 0 ? "+" : ""}${o.point}`
  );
  const total = collectMarket(game, "totals", o =>
    `${o.name} ${o.point}`
  );

  return `
    <a href="/props.html?id=${game.id}"
       class="game-card"
       style="text-decoration:none;color:inherit">

      <div class="game-header">
        <div class="teams">
          <img src="${away?.logo || ""}" alt="${game.away_team}" />
          <span>@</span>
          <img src="${home?.logo || ""}" alt="${game.home_team}" />
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>

      ${renderMarket("ML", ml)}
      ${renderMarket("SPREAD", spread)}
      ${renderMarket("TOTAL", total)}

      <div class="muted" style="margin-top:8px;font-size:.75rem">
        Click to view player props
      </div>
    </a>
  `;
}

/* ===============================
   BOOTSTRAP (CANNOT FAIL)
   =============================== */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  if (!container) return;

  const games = await fetchGames();

  if (!games.length) {
    container.innerHTML =
      `<div class="muted">No NFL games available right now.</div>`;
    return;
  }

  container.innerHTML = games
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .map(gameCard)
    .join("");
});
