import { Teams } from "./teams.js";

const pct = v =>
  v == null || !Number.isFinite(v) ? "—" : (v * 100).toFixed(1) + "%";

const fmtOdds = o =>
  o == null ? "—" : o > 0 ? `+${o}` : `${o}`;

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

function renderMarket(tag, rows) {
  if (!rows.length) return "";

  return rows.map(r => `
    <div class="market-row">
      <span class="market-tag">${tag}</span>

      <div class="market-main">
        <div class="market-name">
          ${r.label}
          ${r.isLean ? `
            <span class="pill-mini pill-play">
              Lean · ${pct(r.confidence)}
            </span>` : ""}
        </div>

        <div class="market-odds">${fmtOdds(r.odds)}</div>

        <div class="market-meta">
          Consensus ${pct(r.prob)}
          ${r.delta != null
            ? ` · Sharp Δ ${(r.delta * 100).toFixed(1)}%`
            : ""}
          ${r.ev != null ? ` · EV ${(r.ev * 100).toFixed(1)}%` : ""}
        </div>
      </div>
    </div>
  `).join("");
}

function collectMarket(game, marketKey, formatter) {
  const market = game.markets?.[marketKey];
  if (!market) return [];

  const lean = market.lean;

  const out = [];
  Object.values(market)
    .filter(Array.isArray)
    .forEach(book => {
      book.forEach(o => {
        out.push({
          label: formatter(o),
          odds: o.odds,
          prob: o.consensus_prob,
          ev: o.ev,
          isLean: lean?.label === o.name,
          confidence: lean?.confidence,
          delta: lean?.delta
        });
      });
    });

  return out;
}

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

      ${renderMarket("ML", ml)}
      ${renderMarket("SPREAD", spread)}
      ${renderMarket("TOTAL", total)}

      <button class="props-toggle">Show Props</button>
      <div class="props-container"></div>
    </div>
  `;
}

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
  } catch {
    container.innerHTML = `<div class="muted">Failed to load games.</div>`;
  }
});
