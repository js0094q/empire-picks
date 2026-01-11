const qs = new URLSearchParams(window.location.search);
const EVENT_ID = qs.get("id");

const pct = v => (v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`);

async function fetchProps() {
  if (!EVENT_ID) return null;
  const r = await fetch(`/api/props?id=${encodeURIComponent(EVENT_ID)}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

function renderPropRow(p) {
  const evText =
    p.ev == null || !Number.isFinite(p.ev) ? "" : ` · EV ${(p.ev * 100).toFixed(1)}%`;

  return `
    <div class="side top">
      <div class="side-main">
        <div class="side-label">
          ${p.player}
          ${p.point != null ? `<span class="pt">${p.point}</span>` : ""}
        </div>
        <div class="side-odds">${fmtOdds(p.odds)}</div>
      </div>

      <div class="side-meta">
        <span class="pill pill-prob">${p.side} ${pct(p.prob)}</span>
        <span class="pill pill-ev">${p.book}${evText}</span>
        <span class="pill pill-top">TOP PROP</span>
      </div>
    </div>
  `;
}

function renderMarketBlock(market, picks) {
  if (!Array.isArray(picks) || !picks.length) return "";

  const rows = picks.map(renderPropRow).join("");

  return `
    <div class="game-card">
      <div class="market-head">
        <div class="market-title">${market.replace(/_/g, " ").toUpperCase()}</div>
      </div>
      <div class="market-sides">${rows}</div>
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("props-container");
  if (!container) return;

  if (!EVENT_ID) {
    container.innerHTML = `<div class="muted">Select a game to view player props.</div>`;
    return;
  }

  const data = await fetchProps();
  if (!data || !data.markets) {
    container.innerHTML = `<div class="muted">No player props available.</div>`;
    return;
  }

  const blocks = [];

  for (const [market, picks] of Object.entries(data.markets)) {
    blocks.push(renderMarketBlock(market, picks));
  }

  container.innerHTML = blocks.some(Boolean)
    ? blocks.join("")
    : `<div class="muted">No qualified props this game.</div>`;
});
