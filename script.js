import { Teams } from "./teams.js";

/* ===============================
   FORMATTERS
   =============================== */

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null || !Number.isFinite(o) ? "—" : o > 0 ? `+${o}` : `${o}`;

const fmtLean = v => {
  if (v == null || !Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${(v * 100).toFixed(1)}%`;
};

const cap = s => (s || "").toString().toUpperCase();

/* ===============================
   FETCH
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
   UI HELPERS
   =============================== */

function leanClass(lean) {
  if (lean == null || !Number.isFinite(lean)) return "lean-neutral";
  if (lean > 0.01) return "lean-sharp";
  if (lean < -0.01) return "lean-public";
  return "lean-neutral";
}

function compositionLabel(sharpShare) {
  if (sharpShare == null || !Number.isFinite(sharpShare)) {
    return { text: "MIXED", cls: "mix" };
  }
  if (sharpShare >= 0.55) return { text: "SHARP-LED", cls: "sharp" };
  if (sharpShare <= 0.45) return { text: "PUBLIC-LED", cls: "public" };
  return { text: "MIXED", cls: "mix" };
}

function renderMarketBlock(title, marketObj) {
  if (!marketObj || !Array.isArray(marketObj.sides) || marketObj.sides.length < 1) return "";

  // ML/spread/total should be 2-way, but we still slice defensively
  const sides = marketObj.sides.slice(0, 2);
  const topKey = sides[0]?.side_key;

  const comp = compositionLabel(marketObj.sharp_share);

  const rows = sides
    .map(s => {
      const isTop = s.side_key === topKey;

      return `
        <div class="side ${isTop ? "top" : ""}">
          <div class="side-main">
            <div class="side-label">
              ${s.name ?? "—"}
              ${s.point != null ? `<span class="pt">${s.point > 0 ? "+" : ""}${s.point}</span>` : ""}
            </div>
            <div class="side-odds">${fmtOdds(s.best_odds)}</div>
          </div>

          <div class="side-meta">
            <span class="pill pill-prob">Consensus ${pct(s.consensus_prob)}</span>
            <span class="pill pill-public">Public ${pct(s.public_prob)}</span>
            <span class="pill ${leanClass(s.lean)}">Lean ${fmtLean(s.lean)}</span>
            ${s.ev != null ? `<span class="pill pill-ev">EV ${(s.ev * 100).toFixed(1)}%</span>` : ""}
            ${isTop ? `<span class="pill pill-top">MOST LIKELY</span>` : ""}
          </div>
        </div>
      `;
    })
    .join("");

  return `
    <div class="market-block">
      <div class="market-head">
        <div class="market-title">${cap(title)}</div>
        <div class="market-badges">
          <span class="badge badge-${comp.cls}">${comp.text}</span>
        </div>
      </div>
      <div class="market-sides">${rows}</div>
    </div>
  `;
}

/* ===============================
   GAME CARD
   =============================== */

function gameCard(game) {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];

  const kickoff = new Date(game.commence_time).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });

  return `
    <a href="/props.html?id=${game.id}"
       class="game-card"
       style="text-decoration:none;color:inherit">

      <div class="game-header">
        <div class="teams">
          <img class="team-logo" src="${away?.logo || ""}" alt="${game.away_team}" />
          <span class="at">@</span>
          <img class="team-logo" src="${home?.logo || ""}" alt="${game.home_team}" />
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>

      ${renderMarketBlock("ML", game?.markets?.h2h)}
      ${renderMarketBlock("SPREAD", game?.markets?.spreads)}
      ${renderMarketBlock("TOTAL", game?.markets?.totals)}

      <div class="muted" style="margin-top:10px;font-size:.78rem;padding:0">
        Click to view player props
      </div>
    </a>
  `;
}

/* ===============================
   BOOTSTRAP
   =============================== */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  if (!container) return;

  const games = await fetchGames();

  if (!games.length) {
    container.innerHTML = `<div class="muted">No NFL games available right now.</div>`;
    return;
  }

  container.innerHTML = games
    .sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time))
    .map(gameCard)
    .join("");
});
