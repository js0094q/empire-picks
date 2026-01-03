/* ===============================
   UTILS
   =============================== */

const qs = new URLSearchParams(window.location.search);
const EVENT_ID = qs.get("id");

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null ? "—" : o > 0 ? `+${o}` : `${o}`;

/* ===============================
   FETCH
   =============================== */

async function fetchProps() {
  if (!EVENT_ID) return null;
  const r = await fetch(`/api/props?id=${EVENT_ID}`);
  return r.ok ? r.json() : null;
}

/* ===============================
   RENDER
   =============================== */

function renderProp(player, market, side) {
  if (!side) return "";

  return `
    <div class="market-row">
      <span class="market-tag">${market}</span>
      <div class="market-main">
        <div class="market-name">${player}</div>
        <div class="market-odds">${fmtOdds(side.odds)}</div>
        <div class="market-meta">
          Consensus ${pct(side.prob)}
          · EV ${(side.ev * 100).toFixed(1)}%
        </div>
      </div>
    </div>
  `;
}

function renderMarketBlock(market, rows) {
  if (!rows.length) return "";

  return `
    <div class="game-card">
      <h3 style="margin-bottom:12px">${market.replace(/_/g, " ")}</h3>
      ${rows.join("")}
    </div>
  `;
}

/* ===============================
   BOOTSTRAP
   =============================== */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("props-container");
  if (!container) return;

  if (!EVENT_ID) {
    container.innerHTML =
      `<div class="muted">Select a game to view player props.</div>`;
    return;
  }

  const data = await fetchProps();
  if (!data || !data.markets) {
    container.innerHTML =
      `<div class="muted">No player props available.</div>`;
    return;
  }

  const blocks = [];

  for (const [market, players] of Object.entries(data.markets)) {
    const rows = [];

    for (const p of players) {
      rows.push(renderProp(p.player, "OVER", p.over));
      rows.push(renderProp(p.player, "UNDER", p.under));
    }

    blocks.push(renderMarketBlock(market, rows));
  }

  container.innerHTML = blocks.length
    ? blocks.join("")
    : `<div class="muted">No qualified props this game.</div>`;
});
