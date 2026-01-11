import { Teams } from "./teams.js";

const qs = new URLSearchParams(window.location.search);
const EVENT_ID = qs.get("id");

const pct = v => (v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`);

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
    return `
      <div class="muted" style="padding:10px 0">
        ${payload.error}
        ${payload.meta?.code ? `<div style="margin-top:6px">Code: ${payload.meta.code}</div>` : ""}
      </div>
    `;
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

function gameHeaderHTML(game) {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const kickoff = new Date(game.commence_time).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });

  return `
    <div class="game-header" style="margin-bottom:0;border-bottom:0;padding-bottom:0">
      <div class="teams">
        <img class="team-logo" src="${away?.logo || ""}" alt="${game.away_team}" />
        <span class="at">@</span>
        <img class="team-logo" src="${home?.logo || ""}" alt="${game.home_team}" />
      </div>
      <div class="kickoff">${kickoff}</div>
    </div>
  `;
}

function gameAccordionCard(game) {
  return `
    <div class="game-card">
      ${gameHeaderHTML(game)}

      <button class="acc-btn" type="button" data-eid="${game.id}">
        <span>Show Props</span>
        <span class="acc-chevron">▾</span>
      </button>

      <div class="acc-panel" id="panel-${game.id}">
        <div class="muted" style="padding:14px 0">Not loaded yet.</div>
      </div>
    </div>
  `;
}

function wireAccordions(container) {
  container.querySelectorAll(".acc-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const eid = btn.getAttribute("data-eid");
      const panel = document.getElementById(`panel-${eid}`);
      const isOpen = btn.classList.contains("open");

      // Toggle closed
      if (isOpen) {
        btn.classList.remove("open");
        panel.style.display = "none";
        return;
      }

      // Open
      btn.classList.add("open");
      panel.style.display = "block";

      // Load once
      if (panel.getAttribute("data-loaded") === "1") return;

      panel.innerHTML = `<div class="muted" style="padding:14px 0">Loading props…</div>`;

      const payload = await fetchProps(eid);
      panel.innerHTML = renderPropsPayload(payload);
      panel.setAttribute("data-loaded", "1");
    });
  });
}

async function renderSingleEvent(container, eventId) {
  container.innerHTML = `<div class="muted">Loading props…</div>`;

  const payload = await fetchProps(eventId);
  const html = renderPropsPayload(payload);

  container.innerHTML = `
    <div class="game-card">
      <div class="market-head">
        <div class="market-title">PROPS</div>
      </div>
      ${html}
    </div>
  `;
}

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("props-container");
  if (!container) return;

  // If user linked directly to a game
  if (EVENT_ID) {
    await renderSingleEvent(container, EVENT_ID);
    return;
  }

  const games = await fetchGames();
  if (!games.length) {
    container.innerHTML = `<div class="muted">No NFL games available right now.</div>`;
    return;
  }

  container.innerHTML = games
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .map(gameAccordionCard)
    .join("");

  // Hide panels by default
  container.querySelectorAll(".acc-panel").forEach(p => (p.style.display = "none"));

  wireAccordions(container);
});
