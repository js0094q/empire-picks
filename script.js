// ========================================================
//  IMPORT TEAM COLORS + LOGOS
// ========================================================
import { NFL_TEAMS } from "./teams.js";

// Shortcuts
const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

const money = o => (o > 0 ? `+${o}` : o);

function prob(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}
function noVig(p1, p2) {
  const t = p1 + p2;
  if (!t) return [0.5, 0.5];
  return [p1 / t, p2 / t];
}
const avg = arr => arr && arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

// ========================================================
//  API WRAPPERS
// ========================================================
const api = {
  async events() {
    const r = await fetch("/api/events");
    if (!r.ok) throw new Error("EVENT API FAILED");
    return r.json();
  },

  async odds() {
    const r = await fetch("/api/odds");
    if (!r.ok) throw new Error("ODDS API FAILED");
    return r.json();
  },

  async props(id) {
    const r = await fetch(`/api/event-odds?eventId=${id}`);
    if (!r.ok) throw new Error("PROPS API FAILED");
    return r.json();
  }
};

// ========================================================
//  ROOT + REFRESH
// ========================================================
const gamesEl = $("#games");
$("#refreshBtn").addEventListener("click", loadAll);

// ========================================================
//  MAIN LOAD
// ========================================================
async function loadAll() {
  gamesEl.textContent = "Loading NFL week data…";

  try {
    const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);

    // FIX: Odds API returns either [ … ] or { data: [ … ] }
    let odds;
    if (Array.isArray(oddsWrap)) odds = oddsWrap;
    else if (Array.isArray(oddsWrap?.data)) odds = oddsWrap.data;
    else odds = [];

    const byId = Object.fromEntries(odds.map(g => [g.id, g]));

    const valid = events.filter(ev => byId[ev.id]);

    gamesEl.innerHTML = "";
    valid.forEach(ev => gamesEl.appendChild(renderGame(ev, byId[ev.id])));

  } catch (err) {
    console.error(err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

// ========================================================
//  GAME CARD
// ========================================================
function renderGame(ev, odds) {
  const card = document.createElement("div");
  card.className = "card";

  const kickoff = new Date(ev.commence_time).toLocaleString();

  card.innerHTML = `
    <div class="card-header">
      <h2>${ev.away_team} @ ${ev.home_team}</h2>
      <small>${kickoff}</small>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="lines">Game Lines</div>
      <div class="tab" data-tab="props">Player Props</div>
    </div>

    <div class="tab-content active" id="lines"></div>
    <div class="tab-content" id="props"><em>Click to load props…</em></div>
  `;

  const header = $(".card-header", card);

  // Logos
  const home = NFL_TEAMS[ev.home_team];
  const away = NFL_TEAMS[ev.away_team];

  if (home && away) {
    header.insertAdjacentHTML("afterbegin", `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <img src="${away.logo}" style="height:44px;width:auto;">
        <span></span>
        <img src="${home.logo}" style="height:44px;width:auto;">
      </div>
    `);
  }

  // Theme
  if (home) {
    card.style.background = `linear-gradient(135deg, ${home.primary}, ${home.secondary}, #0d1228)`;
    card.style.borderColor = home.secondary;
  }

  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  header.insertAdjacentHTML("beforeend", analyticsHTML(analytics));

  // Render Lines
  renderLines($("#lines", card), odds, analytics);

  // Tabs
  $$(".tab", card).forEach(t => {
    t.addEventListener("click", () => {
      $$(".tab", card).forEach(x=>x.classList.remove("active"));
      $$(".tab-content", card).forEach(x=>x.classList.remove("active"));

      t.classList.add("active");
      const target = card.querySelector(`#${t.dataset.tab}`);
      target.classList.add("active");

      if (t.dataset.tab === "props" && !target.dataset.loaded) {
        loadProps(ev.id, target);
      }
    });
  });

  return card;
}

// ========================================================
//  GAME ANALYTICS ENGINE
// ========================================================
function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers ?? [];

  const mlA = [], mlH = [];
  const spreads = [];
  const totals = [];

  books.forEach(bm => {
    (bm.markets || []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === away);
        const h = m.outcomes.find(o => o.name === home);
        if (a && h) {
          mlA.push(prob(a.price));
          mlH.push(prob(h.price));
        }
      }
      if (m.key === "spreads") spreads.push(...m.outcomes);
      if (m.key === "totals") totals.push(...m.outcomes);
    });
  });

  const avgA = avg(mlA), avgH = avg(mlH);
  const [nvA, nvH] = noVig(avgA, avgH);

  const winner = nvA > nvH ? away : home;
  const winnerProb = Math.max(nvA, nvH);

  return {
    away,
    home,
    nvAway: nvA,
    nvHome: nvH,
    winner,
    winnerProb
  };
}

// ========================================================
//  CLEAN ANALYTICS HTML BLOCK
// ========================================================
function analyticsHTML(a) {
  return `
    <div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.25);">
      <div style="color:#ffcc33;font-weight:600;margin-bottom:6px;font-size:0.92rem;">
        📊 EmpirePicks Forecast
      </div>

      <div style="font-size:0.83rem;line-height:1.35;">
        <strong>Win Probability:</strong><br>
        • ${a.winner} favored at ${(a.winnerProb * 100).toFixed(1)}%<br>
      </div>
    </div>
  `;
}

// ========================================================
//  LINES TABLE — ONE ROW PER BOOK
// ========================================================
function renderLines(container, odds, analytics) {
  const rows = [];

  (odds.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      moneyline: "–",
      mlAway: null,
      mlHome: null,
      spread: "–",
      total: "–",
      edge: null
    };

    // pick the best ML line for this book
    const h2h = bm.markets?.find(m => m.key === "h2h");
    if (h2h) {
      const a = h2h.outcomes.find(o => o.name === analytics.away);
      const h = h2h.outcomes.find(o => o.name === analytics.home);
      if (a && h) {
        rec.moneyline = `${money(a.price)} / ${money(h.price)}`;
        rec.mlAway = a.price;
        rec.mlHome = h.price;
        rec.edge = Math.max(
          analytics.nvAway - prob(a.price),
          analytics.nvHome - prob(h.price)
        );
      }
    }

    // best spread
    const spreads = bm.markets?.find(m => m.key === "spreads")?.outcomes || [];
    if (spreads.length) {
      const best = spreads[Math.floor(spreads.length / 2)] ?? spreads[0];
      rec.spread = `${best.name} ${best.point} (${money(best.price)})`;
    }

    // best total
    const totals = bm.markets?.find(m => m.key === "totals")?.outcomes || [];
    if (totals.length >= 2) {
      const over = totals.find(o => o.name.toLowerCase() === "over");
      const under = totals.find(o => o.name.toLowerCase() === "under");
      if (over && under) {
        rec.total = `O${over.point} / U${under.point}`;
      }
    }

    rows.push(rec);
  });

  const bestIndex = rows.reduce((iBest, r, i) =>
    (typeof r.edge === "number" && r.edge > (rows[iBest]?.edge || 0)) ? i : iBest
  , -1);

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Book</th>
          <th>Moneyline</th>
          <th>Spread</th>
          <th>Total</th>
          <th>EV</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r,i)=>`
          <tr>
            <td>${r.book}</td>
            <td>
              ${r.moneyline}
              ${
                r.mlAway != null && r.mlHome != null
                  ? `
                    <div style="margin-top:3px;font-size:0.75rem;">
                      <button class="add-leg" data-market="ML" 
                        data-team="${analytics.away}" 
                        data-price="${r.mlAway}"
                        data-trueprob="${analytics.nvAway}"
                        data-game="${analytics.away} @ ${analytics.home}"
                      >➕ ${analytics.away}</button>

                      <button class="add-leg" data-market="ML" 
                        data-team="${analytics.home}" 
                        data-price="${r.mlHome}"
                        data-trueprob="${analytics.nvHome}"
                        data-game="${analytics.away} @ ${analytics.home}"
                      >➕ ${analytics.home}</button>
                    </div>
                  `
                  : ""
              }
            </td>
            <td>${r.spread}</td>
            <td>${r.total}</td>
            <td>
              ${
                typeof r.edge === "number"
                  ? `${(r.edge*100).toFixed(1)}%`
                  : ""
              }
              ${i === bestIndex && r.edge > 0 ? "⭐" : ""}
            </td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `;
}

// ========================================================
//  PLAYER PROPS (UNCHANGED EXCEPT FIXED PARLAY BUTTON NAME)
// ========================================================
async function loadProps(id, container) {
  container.dataset.loaded = "1";
  container.textContent = "Loading props…";

  try {
    const wrap = await api.props(id);
    const props = wrap?.props?.bookmakers ?? [];

    if (!props.length) {
      container.textContent = "No props available.";
      return;
    }

    let html = "";

    props.forEach(bm => {
      (bm.markets || []).forEach(m => {
        html += `
          <h3>${m.key}</h3>
          <table class="table">
            <thead><tr><th>Player</th><th>Pick</th><th>Line</th><th>Price</th><th>Parlay</th></tr></thead>
            <tbody>
              ${m.outcomes
                .map(o => `
                <tr>
                  <td>${o.description || o.player || "–"}</td>
                  <td>${o.name}</td>
                  <td>${o.point ?? "–"}</td>
                  <td>${money(o.price)}</td>
                  <td>
                    <button class="add-leg"
                      data-market="PROP"
                      data-name="${o.description || o.player} ${o.name} ${o.point ?? ""}"
                      data-player="${o.description || o.player}"
                      data-type="${m.key}"
                      data-side="${o.name}"
                      data-point="${o.point ?? ""}"
                      data-price="${o.price}"
                      data-trueprob="${prob(o.price)}"
                      data-game="${id}"
                    >
                      ➕ Add
                    </button>
                  </td>
                </tr>`).join("")}
            </tbody>
          </table>
        `;
      });
    });

    container.innerHTML = html;

  } catch (err) {
    console.error(err);
    container.textContent = "Failed to load props.";
  }
}

// ========================================================
//  STARTUP
// ========================================================
loadAll();

// Export for dashboard
export { computeGameAnalytics };
