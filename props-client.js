const qs = new URLSearchParams(window.location.search);
const EVENT_ID = qs.get("id");

const pct = v => (v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`);

async function fetchProps() {
  if (!EVENT_ID) return null;
  const r = await fetch(`/api/props?id=${encodeURIComponent(EVENT_ID)}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

function renderPropRow(p, rank) {
  const evText =
    p.ev == null || !Number.isFinite(p.ev) ? "" : ` · EV ${(p.ev * 100).toFixed(1)}%`;

  return `
    <div class="side ${rank === 0 ? "top" : ""}">
      <div class="side-main">
        <div class="side-label">
          ${p.player}
          ${p.point != null ? `<span class="pt">${p.point}</span>` : ""}
          <span class="pt">· ${p.side}</span>
        </div>
        <div class="side-odds">${fmtOdds(p.odds)}</div>
      </div>

      <div class="side-meta">
        <span class="pill pill-prob">${pct(p.prob)}</span>
        <span class="pill pill-ev">${p.book}${evText}</span>
        <span class="pill lean-neutral">${p.books} books</span>
        ${rank === 0 ? `<span class="pill pill-top">TOP IN MARKET</span>` : ""}
      </div>
    </div>
  `;
}

function renderMarketBlock(market, picks) {
  if (!Array.isArray(picks) || !picks.length) return "";

  const rows = picks.map((p, i) => renderPropRow(p, i)).join("");

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

  if (!data) {
    container.innerHTML = `<div class="muted">No response from props endpoint.</div>`;
    return;
  }

  if (data.error) {
    container.innerHTML = `
      <div class="game-card">
        <div class="market-head">
          <div class="market-title">PROPS UNAVAILABLE</div>
        </div>
        <div class="muted" style="padding:10px 0">
          ${data.error}
        </div>
        ${data.meta?.code ? `<div class="muted" style="padding:0">Code: ${data.meta.code}</div>` : ""}
      </div>
    `;
    return;
  }

  if (!data.markets || Object.keys(data.markets).length === 0) {
    container.innerHTML = `<div class="muted">No props returned for this event.</div>`;
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
