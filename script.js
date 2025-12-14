/* =========================================================
   EMPIREPICKS — SINGLE FILE APPLICATION
   ========================================================= */

(() => {
  /* =======================
     CONFIG
     ======================= */

  const BOOK_WEIGHTS = {
    pinnacle: 1.3,
    circa: 1.3,
    betonline: 1.25,

    draftkings: 1.0,
    fanduel: 1.0,

    caesars: 0.8,
    mgm: 0.75,
    betrivers: 0.7,
    default: 0.7
  };

  const MIN_EV = 0.02;
  const MIN_PROB = 0.52;

  const state = {
    games: [],
    parlay: []
  };

  /* =======================
     HELPERS
     ======================= */

  const pct = x => `${(x * 100).toFixed(1)}%`;
  const fmtOdds = o => (o > 0 ? `+${o}` : `${o}`);

  function impliedProb(odds) {
    return odds > 0
      ? 100 / (odds + 100)
      : Math.abs(odds) / (Math.abs(odds) + 100);
  }

  function strengthTier(prob, ev) {
    if (prob > 0.75 && ev > 0.08) return "very-strong";
    if (prob > 0.65 && ev > 0.05) return "strong";
    if (prob > 0.55 && ev > 0.03) return "moderate";
    return "weak";
  }

  function weightForBook(key = "") {
    key = key.toLowerCase();
    return BOOK_WEIGHTS[key] ?? BOOK_WEIGHTS.default;
  }

  function weightedConsensus(outcomes) {
    let wSum = 0;
    let pSum = 0;

    outcomes.forEach(o => {
      const w = weightForBook(o.book);
      const p = impliedProb(o.odds);
      wSum += w;
      pSum += p * w;
    });

    return pSum / wSum;
  }

  function kickoff(utc) {
    return new Date(utc).toLocaleString("en-US", {
      timeZone: "America/New_York",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  }

  /* =======================
     DATA FETCH
     ======================= */

  async function loadGames() {
    const r = await fetch("/api/events");
    state.games = await r.json();
    render();
  }

  /* =======================
     RENDER ROOT
     ======================= */

  function render() {
    const container = document.getElementById("games-container");
    container.innerHTML = "";

    state.games.forEach(game => {
      container.appendChild(renderGame(game));
    });
  }

  /* =======================
     GAME CARD
     ======================= */

  function renderGame(game) {
    const card = document.createElement("div");
    card.className = "game-card";

    card.innerHTML = `
      <div class="game-header">
        <div class="teams">
          ${game.away_team} @ ${game.home_team}
        </div>
        <div class="time">${kickoff(game.commence_time)}</div>
      </div>
    `;

    const grid = document.createElement("div");
    grid.className = "markets-grid";

    grid.appendChild(renderMarket("Moneyline", game.books.h2h));
    grid.appendChild(renderMarket("Spread", game.books.spreads));
    grid.appendChild(renderMarket("Total", game.books.totals));

    card.appendChild(grid);

    if (game.props && Object.keys(game.props).length) {
      card.appendChild(renderProps(game.props));
    }

    return card;
  }

 function renderMarket(title, rows = []) {
  const box = document.createElement("div");
  box.className = "market-box";
  box.innerHTML = `<h4>${title}</h4>`;

  if (!Array.isArray(rows) || rows.length === 0) return box;

  const sides = {};

  rows.forEach(r => {
    if (!r || !Array.isArray(r.outcomes)) return;

    r.outcomes.forEach(o => {
      if (!o || typeof o.odds !== "number" || !o.name) return;

      if (!sides[o.name]) sides[o.name] = [];
      sides[o.name].push({
        odds: o.odds,
        book: r.book || "default"
      });
    });
  });

  Object.entries(sides).forEach(([name, offers]) => {
    if (offers.length === 0) return;

    const fair = weightedConsensus(offers);
    if (!isFinite(fair)) return;

    const best = offers.reduce((a, b) =>
      impliedProb(b.odds) < impliedProb(a.odds) ? b : a
    );

    const imp = impliedProb(best.odds);
    const ev = fair - imp;

    if (!isFinite(ev) || fair < MIN_PROB) return;

    const tier = strengthTier(fair, ev);

    box.appendChild(renderPick({
      label: name,
      odds: best.odds,
      fair,
      ev,
      tier
    }));
  });

  return box;
}
  /* =======================
     PICK TILE
     ======================= */

  function renderPick(p) {
    const div = document.createElement("div");
    div.className = `pick ${p.tier}`;

    div.innerHTML = `
      <div class="pick-main">
        <strong>${p.label} ${fmtOdds(p.odds)}</strong>
        <div class="meta">
          Model ${pct(p.fair)} • EV ${pct(p.ev)}
        </div>
      </div>
      <div class="actions">
        <div class="badge ${p.tier}">${p.tier.replace("-", " ")}</div>
        <button class="parlay-btn"
          data-label="${p.label}"
          data-odds="${p.odds}"
          data-prob="${p.fair}">
          + Parlay
        </button>
      </div>
    `;
    return div;
  }

  /* =======================
     PROPS
     ======================= */

  function renderProps(categories) {
    const wrap = document.createElement("div");
    wrap.className = "props";

    Object.entries(categories).forEach(([cat, props]) => {
      const sec = document.createElement("div");
      sec.innerHTML = `<h4>${cat}</h4>`;

      props.forEach(p => {
        ["over", "under"].forEach(side => {
          if (!p[`${side}_odds`] || !p[`${side}_prob`]) return;

          const fair = p[`${side}_prob`];
          if (fair < MIN_PROB) return;

          const imp = impliedProb(p[`${side}_odds`]);
          const ev = fair - imp;
          const tier = strengthTier(fair, ev);

          sec.appendChild(renderPick({
            label: `${p.player} ${side} ${p.point}`,
            odds: p[`${side}_odds`],
            fair,
            ev,
            tier
          }));
        });
      });

      wrap.appendChild(sec);
    });

    return wrap;
  }

  /* =======================
     PARLAY
     ======================= */

  document.addEventListener("click", e => {
    const btn = e.target.closest(".parlay-btn");
    if (!btn) return;

    const leg = {
      label: btn.dataset.label,
      odds: +btn.dataset.odds,
      prob: +btn.dataset.prob
    };

    if (!state.parlay.find(l => l.label === leg.label)) {
      state.parlay.push(leg);
    }

    openParlay();
  });

  function openParlay() {
    const modal = document.getElementById("parlay-modal");
    const legs = document.getElementById("parlay-legs");
    const sum = document.getElementById("parlay-summary");
    const stake = +document.getElementById("parlay-stake").value;

    legs.innerHTML = "";
    let mult = 1;
    let prob = 1;

    state.parlay.forEach(l => {
      mult *= l.odds > 0 ? l.odds / 100 + 1 : 100 / Math.abs(l.odds) + 1;
      prob *= l.prob;
      legs.innerHTML += `<div>${l.label} (${fmtOdds(l.odds)})</div>`;
    });

    sum.innerHTML = `
      ${stake.toFixed(2)} → ${(stake * mult).toFixed(2)}<br>
      Prob ${pct(prob)} • EV ${pct(prob * mult - 1)}
    `;

    modal.classList.add("open");
    document.getElementById("parlay-backdrop").classList.add("open");
  }

  document.getElementById("close-parlay").onclick = () => {
    document.getElementById("parlay-modal").classList.remove("open");
    document.getElementById("parlay-backdrop").classList.remove("open");
  };

  /* =======================
     INIT
     ======================= */

  document.getElementById("refresh-btn").onclick = loadGames;
  loadGames();

})();
