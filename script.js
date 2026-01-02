// script.js
import { Teams } from "./teams.js";

/* =========================================================
   FORMATTERS & MATH
   ========================================================= */

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null ? "—" : o > 0 ? `+${o}` : `${o}`;

const impliedFromOdds = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

/*
  Percentile-based EV signal
*/
function valueSignal(ev, dist) {
  if (ev == null || dist.length < 2) return { cls: "signal-weak", txt: "MIN" };
  const s = [...dist].sort((a, b) => a - b);
  const r = s.lastIndexOf(ev) / (s.length - 1);
  if (r >= 0.9) return { cls: "signal-very-strong", txt: "HIGH" };
  if (r >= 0.7) return { cls: "signal-strong", txt: "MED" };
  if (r >= 0.4) return { cls: "signal-moderate", txt: "LOW" };
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
   MOST LIKELY OUTCOME ENGINE (LEAN-BASED)
   ========================================================= */

function mostLikelyOutcome(game) {
  const candidates = [];

  function ingest(label, side) {
    if (!side?.consensus_prob) return;
    candidates.push({
      label,
      prob: side.consensus_prob,
      stability: side.stability || 0.75
    });
  }

  const h2h = game.markets?.h2h;
  if (h2h) {
    const firstBook = Object.values(h2h)[0];
    firstBook?.forEach(o => ingest(o.name, o));
  }

  const spreads = game.markets?.spreads;
  if (spreads) {
    const firstBook = Object.values(spreads)[0];
    firstBook?.forEach(o =>
      ingest(`${o.name} ${o.point > 0 ? "+" : ""}${o.point}`, o)
    );
  }

  const totals = game.markets?.totals;
  if (totals) {
    const firstBook = Object.values(totals)[0];
    firstBook?.forEach(o =>
      ingest(`${o.name} ${o.point}`, o)
    );
  }

  if (!candidates.length) return null;

  return candidates
    .map(c => ({ ...c, score: c.prob * c.stability }))
    .sort((a, b) => b.score - a.score)[0];
}

/* =========================================================
   GAME SUMMARY
   ========================================================= */

function buildSummary(game) {
  const likely = mostLikelyOutcome(game);
  if (!likely) return "";

  return `
    <div class="game-summary">
      <div class="summary-item">
        <span class="badge badge-lean">Most Likely</span>
        ${likely.label} (${pct(likely.prob)})
      </div>
      <div class="summary-item">
        <span class="badge badge-stability">Consensus</span>
        ${stabilityLabel(likely.stability)}
      </div>
    </div>
  `;
}

/* =========================================================
   MARKET RENDERERS
   ========================================================= */

function renderMarket(type, tag, rows) {
  if (!rows.length) return "";

  const evs = rows.map(r => r.ev).filter(v => v != null);
  const maxEv = evs.length ? Math.max(...evs) : null;

  return rows.map(r => {
    const sig = valueSignal(r.ev, evs);
    const best = r.ev === maxEv && maxEv > 0;

    return `
      <div class="market-row ${best ? "best-value" : ""}">
        <span class="market-tag ${type}">${tag}</span>

        <div class="market-main">
          <div class="market-name">
            ${r.label}
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
   PROPS
   ========================================================= */

function renderProps(container, data) {
  if (!data?.markets) {
    container.innerHTML = `<div class="muted">No props available.</div>`;
    return;
  }

  container.innerHTML = Object.entries(data.markets).map(([k, props]) => `
    <div class="props-category">
      <div class="props-category-title">${k.replace(/_/g, " ")}</div>
      ${props.flatMap(p => {
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
        });
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

      ${buildSummary(game)}

      ${renderMarket("ml", "ML", ml)}
      ${renderMarket("spread", "SPREAD", spread)}
      ${renderMarket("total", "TOTAL", total)}

      <button class="props-toggle">Show Props</button>
      <div class="props-container"></div>

      <div class="muted" style="margin-top:8px;font-size:0.75rem">
        Most Likely reflects market agreement and stability, not payout value.
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
