import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

const impliedFromOdds = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const safe = x => (Number.isFinite(x) ? x : null);

/* =========================================================
   SIGNAL LOGIC
   ========================================================= */

function signalFromDistribution(ev, evs) {
  if (ev == null || evs.length < 2) return { cls: "signal-weak", txt: "MIN" };
  const sorted = [...evs].sort((a, b) => a - b);
  const rank = sorted.lastIndexOf(ev) / (sorted.length - 1);
  if (rank >= 0.9) return { cls: "signal-very-strong", txt: "HIGH" };
  if (rank >= 0.7) return { cls: "signal-strong", txt: "MED" };
  if (rank >= 0.4) return { cls: "signal-moderate", txt: "LOW" };
  return { cls: "signal-weak", txt: "MIN" };
}

/* =========================================================
   SPORT-AWARE FETCH
   ========================================================= */

const SPORT = document.body.dataset.sport || "nfl";

const fetchGames = async () => {
  const url = SPORT === "nhl" ? "/api/events_nhl" : "/api/events";
  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to load games");
  return r.json();
};

const fetchProps = async id => {
  const url =
    SPORT === "nhl"
      ? `/api/props_nhl?id=${encodeURIComponent(id)}`
      : `/api/props?id=${encodeURIComponent(id)}`;

  const r = await fetch(url);
  if (!r.ok) throw new Error("Failed to load props");
  return r.json();
};

/* =========================================================
   MARKET RENDERING
   ========================================================= */

function renderMarketRows(type, label, options) {
  const viable = options.filter(o => o && o.odds != null && o.consensus_prob != null);
  if (!viable.length) return "";

  const evs = viable.map(o => safe(o.ev)).filter(v => v != null);
  const maxProb = Math.max(...viable.map(o => impliedFromOdds(o.odds)));
  const maxEv = evs.length ? Math.max(...evs) : null;

  return viable.map(o => {
    const s = signalFromDistribution(o.ev, evs);
    const booksFavor = impliedFromOdds(o.odds) === maxProb;
    const bestValue = o.ev != null && o.ev === maxEv && maxEv > 0;

    return `
      <div class="market-row ${booksFavor ? "book-fav" : ""} ${bestValue ? "best-value" : ""}">
        <span class="market-tag ${type}">${label}</span>
        <div class="market-main">
          <div class="market-name">
            ${o.team || o.side}
            ${booksFavor ? `<span class="pill-mini pill-fav">BOOKS FAVOR</span>` : ""}
            ${bestValue ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
          </div>
          <div class="market-odds">${fmtOdds(o.odds)}</div>
          <div class="market-meta">
            Books ${pct(impliedFromOdds(o.odds))}
            · Consensus ${pct(o.consensus_prob)}
            · Value ${(o.ev * 100).toFixed(1)}%
          </div>
        </div>
        <div class="signal-bubble ${s.cls}">${s.txt}</div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   GAME NARRATIVE
   ========================================================= */

function gameNarrative(game) {
  const h = game.best?.ml?.home;
  const a = game.best?.ml?.away;
  if (!h || !a) return "";

  const lean = h.consensus_prob > a.consensus_prob ? game.home_team : game.away_team;
  const value = h.ev > a.ev ? game.home_team : game.away_team;

  return `
    <div class="muted" style="margin:10px 0;font-size:0.8rem">
      Market leans <b>${lean}</b>. Strongest value signal currently on <b>${value}</b>.
    </div>
  `;
}

/* =========================================================
   PROPS RENDERING
   ========================================================= */

function renderProps(container, categories) {
  if (!categories || !Object.keys(categories).length) {
    container.innerHTML = `<div class="muted">No props available.</div>`;
    return;
  }

  container.innerHTML = Object.entries(categories).map(([cat, props]) => {
    const rows = props.flatMap(p => {
      const out = [];
      if (p.over_odds != null)
        out.push({ ...p, side: "Over", odds: p.over_odds, ev: p.over_ev, prob: p.over_prob });
      if (p.under_odds != null)
        out.push({ ...p, side: "Under", odds: p.under_odds, ev: p.under_ev, prob: p.under_prob });
      return out;
    });

    const evs = rows.map(r => safe(r.ev)).filter(v => v != null);
    const maxEv = evs.length ? Math.max(...evs) : null;

    return `
      <div class="props-category">
        <div class="props-category-title">${cat}</div>
        ${rows.map(r => {
          const s = signalFromDistribution(r.ev, evs);
          const bestValue = r.ev === maxEv && maxEv > 0;

          return `
            <div class="prop-row">
              <div>
                <div class="prop-player">${r.player}</div>
                <div class="prop-line">
                  ${r.side} ${r.point} ${r.label}
                  ${bestValue ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
                </div>
                <div class="market-meta">
                  Consensus ${pct(r.prob)} · Value ${(r.ev * 100).toFixed(1)}%
                </div>
              </div>
              <div>
                <div class="signal-bubble ${s.cls}">${s.txt}</div>
                <div class="prop-odds">${fmtOdds(r.odds)}</div>
              </div>
            </div>
          `;
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

  return `
    <div class="game-card" data-game-id="${game.id}">
      <div class="game-header">
        <div class="teams">
          <img src="${away?.logo || ""}" />
          <span>@</span>
          <img src="${home?.logo || ""}" />
        </div>
      </div>

      ${gameNarrative(game)}

      <button class="props-toggle">Show Props</button>

      ${renderMarketRows("ml", "ML", [
        { ...game.best?.ml?.away, team: game.away_team },
        { ...game.best?.ml?.home, team: game.home_team }
      ])}

      <div class="props-container"></div>
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
  const games = await fetchGames();
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
