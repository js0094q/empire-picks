import { Teams } from "./teams.js";

const pct = v => (v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`);

const fmtLean = v => {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
};

function leanClass(v) {
  if (v == null || !Number.isFinite(v)) return "lean-neutral";
  if (v > 0.01) return "lean-sharp";
  if (v < -0.01) return "lean-public";
  return "lean-neutral";
}

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

async function fetchProps(eventId) {
  const r = await fetch(`/api/props?id=${encodeURIComponent(eventId)}`, { cache: "no-store" });
  return r.ok ? r.json() : null;
}

function gameHeaderHTML(game) {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const kickoff = new Date(game.commence_time).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });

  return `
    <div class="game-header">
      <div class="teams">
        <img class="team-logo" src="${away?.logo || ""}" alt="${game.away_team}" />
        <span class="at">@</span>
        <img class="team-logo" src="${home?.logo || ""}" alt="${game.home_team}" />
      </div>
      <div class="kickoff">${kickoff}</div>
    </div>
  `;
}

function renderPropRow(p, rank) {
  const evText = p.ev == null || !Number.isFinite(p.ev) ? "" : `EV ${(p.ev * 100).toFixed(1)}%`;

  const sharpLabel = p.sharp_source === "proxy" ? "Sharp*" : "Sharp";

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

        <span class="pill pill-sharp">${sharpLabel} ${pct(p.sharp_prob)}</span>
        <span class="pill pill-public">Public ${pct(p.public_prob)}</span>

        <span class="pill ${leanClass(p.book_lean)}">Book Lean ${fmtLean(p.book_lean)}</span>
        <span class="pill ${leanClass(p.market_lean)}">Market Lean ${fmtLean(p.market_lean)}</span>

        <span class="pill pill-ev">${p.book}${evText ? ` · ${evText}` : ""}</span>
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
    <div class="market-block">
      <div class="market-head">
        <div class="market-title">${market.replace(/_/g, " ").toUpperCase()}</div>
      </div>
      <div class="market-sides">${rows}</div>
    </div>
  `;
}

function renderPropsPayload(payload) {
  if (!payload) {
    return `<div class="muted" style="padding:10px 0">No response from props endpoint.</div>`;
  }

  if (payload.error) {
    return `<div class="muted" style="padding:10px 0">${payload.error}</div>`;
  }

  const markets = payload.markets || {};
  const keys = Object.keys(markets);

  if (!keys.length) {
    return `<div class="muted" style="padding:10px 0">No props returned for this event.</div>`;
  }

  const blocks = keys
    .map(k => renderMarketBlock(k, markets[k]))
    .filter(Boolean)
    .join("");

  return blocks || `<div class="muted" style="padding:10px 0">No qualified props this game.</div>`;
}

function gameCardShell(game) {
  return `
    <div class="game-card" id="game-${game.id}">
      ${gameHeaderHTML(game)}
      <div class="props-body" id="props-${game.id}">
        <div class="muted" style="padding:14px 0">Loading props…</div>
      </div>
    </div>
  `;
}

/**
 * Concurrency-limited loader to avoid rate limits
 */
async function runWithConcurrency(items, workerFn, concurrency = 3) {
  const queue = items.slice();
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length) {
      const item = queue.shift();
      await workerFn(item);
    }
  });
  await Promise.all(workers);
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("props-container");
  if (!container) return;

  const games = await fetchGames();
  if (!games.length) {
    container.innerHTML = `<div class="muted">No NFL games available right now.</div>`;
    return;
  }

  const sorted = games.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));
  container.innerHTML = sorted.map(gameCardShell).join("");

  await runWithConcurrency(
    sorted,
    async (game) => {
      const mount = document.getElementById(`props-${game.id}`);
      if (!mount) return;

      const payload = await fetchProps(game.id);
      mount.innerHTML = renderPropsPayload(payload);
    },
    3
  );
});
