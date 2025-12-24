import { Teams } from "./teams.js";

/* =========================================================
   HELPERS
   ========================================================= */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

const impliedFromOdds = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const safe = x => (Number.isFinite(x) ? x : null);

/*
  VALUE SIGNAL
  Percentile rank of EV within a market
*/
function signalFromDistribution(ev, evs) {
  if (ev == null || evs.length < 2) {
    return { cls: "signal-weak", txt: "MIN" };
  }

  const sorted = [...evs].sort((a, b) => a - b);
  const rank = sorted.lastIndexOf(ev) / (sorted.length - 1);

  if (rank >= 0.9) return { cls: "signal-very-strong", txt: "HIGH" };
  if (rank >= 0.7) return { cls: "signal-strong", txt: "MED" };
  if (rank >= 0.4) return { cls: "signal-moderate", txt: "LOW" };
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
   MARKET ROWS
   ========================================================= */

function formatMarketLabel(type, o) {
  if (type === "ml") return o.team;
  if (type === "spread") {
    const s = o.point > 0 ? "+" : "";
    return `${o.team} ${s}${o.point}`;
  }
  if (type === "total") return `${o.side} ${o.point}`;
  return "—";
}

function renderMarketRows(type, label, options) {
  const viable = options.filter(o => o && o.odds != null && o.consensus_prob != null);
  if (!viable.length) return "";

  const marketProbs = viable.map(o => impliedFromOdds(o.odds));
  const maxMarketProb = Math.max(...marketProbs);

  const evs = viable.map(o => safe(o.ev)).filter(v => v != null);
  const maxEv = evs.length ? Math.max(...evs) : null;

  return viable.map(o => {
    const marketProb = impliedFromOdds(o.odds);
    const s = signalFromDistribution(o.ev, evs);

    const booksFavor = marketProb === maxMarketProb;
    const bestValue = o.ev != null && o.ev === maxEv && maxEv > 0;

    return `
      <div class="market-row ${booksFavor ? "book-fav" : ""} ${bestValue ? "best-value" : ""}">
        <span class="market-tag ${type}">${label}</span>

        <div class="market-main">
          <div class="market-name">
            ${formatMarketLabel(type, o)}
            ${booksFavor ? `<span class="pill-mini pill-fav">BOOKS FAVOR</span>` : ""}
            ${bestValue ? `<span class="pill-mini pill-value">BEST VALUE</span>` : ""}
          </div>

          <div class="market-odds">${fmtOdds(o.odds)}</div>

          <div class="market-meta">
            Books ${pct(marketProb)}
            · Consensus ${pct(o.consensus_prob)}
            · Value ${(safe(o.ev) == null ? "—" : (o.ev * 100).toFixed(1) + "%")}
          </div>
        </div>

        <div class="signal-bubble ${s.cls}" title="Relative value signal">${s.txt}</div>
      </div>
    `;
  }).join("");
}

/* =========================================================
   PROPS
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
        ${rows.slice(0, 4).map(r => {
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
                  Consensus ${pct(r.prob)}
                  · Value ${(r.ev * 100).toFixed(1)}%
                </div>
              </div>

              <div class="prop-right">
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
   PER-GAME SUMMARY
   ========================================================= */

function buildGameSummary(game) {
  const opts = [];

  const push = (market, label, o) => {
    if (!o) return;
    opts.push({
      market,
      label,
      bookP: impliedFromOdds(o.odds),
      ev: safe(o.ev),
      stab: safe(o.stability)
    });
  };

  push("ML", game.home_team, game.best?.ml?.home);
  push("ML", game.away_team, game.best?.ml?.away);

  const spread = game.best?.spread;
  if (spread?.home) push("SPREAD", `${game.home_team} ${spread.home.point}`, spread.home);
  if (spread?.away) push("SPREAD", `${game.away_team} ${spread.away.point}`, spread.away);

  const total = game.best?.total;
  if (total?.over) push("TOTAL", `Over ${total.over.point}`, total.over);
  if (total?.under) push("TOTAL", `Under ${total.under.point}`, total.under);

  if (!opts.length) return "";

  const lean = [...opts].sort((a, b) => b.bookP - a.bookP)[0];
  const value = [...opts].filter(o => o.ev != null).sort((a, b) => b.ev - a.ev)[0];

  const avgStab =
    opts.map(o => o.stab).filter(v => v != null).reduce((a, b) => a + b, 0) /
    opts.filter(o => o.stab != null).length || null;

  return `
    <div class="game-summary">
      <div class="summary-item">
        <span class="badge badge-lean">Market Lean</span>
        ${lean.market} • ${lean.label} (${pct(lean.bookP)})
      </div>

      <div class="summary-item">
        <span class="badge badge-value">Best Value</span>
        ${value ? `${value.market} • ${value.label} (${(value.ev * 100).toFixed(1)}%)` : "—"}
      </div>

      <div class="summary-item">
        <span class="badge badge-stability">Consensus</span>
        ${stabilityLabel(avgStab)}
      </div>
    </div>
  `;
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

      ${buildGameSummary(game)}

      <button class="props-toggle">Show Props</button>

      ${renderMarketRows("ml", "ML", [
        { ...game.best?.ml?.away, team: game.away_team },
        { ...game.best?.ml?.home, team: game.home_team }
      ])}

      ${renderMarketRows("spread", "SPREAD", [
        { ...game.best?.spread?.away, team: game.away_team },
        { ...game.best?.spread?.home, team: game.home_team }
      ])}

      ${renderMarketRows("total", "TOTAL", [
        { ...game.best?.total?.over, side: "Over" },
        { ...game.best?.total?.under, side: "Under" }
      ])}

      <div class="props-container"></div>

      <div class="muted" style="margin-top:8px;font-size:0.75rem">
        Value Signal reflects pricing divergence, not outcome certainty.
      </div>
    </div>
  `;
}

/* =========================================================
   BOOTSTRAP
   ========================================================= */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");
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
      renderProps(propsEl, data.categories);
      btn.textContent = "Hide Props";
    } catch {
      propsEl.innerHTML = `<div class="muted">Failed to load props.</div>`;
      btn.textContent = "Show Props";
    }
  });
});
