// ========================================================
//  IMPORT TEAM COLORS + LOGOS
// ========================================================
import { NFL_TEAMS } from "./teams.js";

// ========================================================
//  SMALL HELPERS
// ========================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const money = o => (o > 0 ? `+${o}` : `${o}`);

function prob(o) {
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}

function noVig(p1, p2) {
  const sum = p1 + p2;
  return sum ? [p1 / sum, p2 / sum] : [0.5, 0.5];
}

const avg = arr => (arr?.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function groupByPoint(arr) {
  const out = {};
  arr.forEach(o => {
    const key = `${o.name}:${o.point}`;
    (out[key] ||= []).push(prob(o.price));
  });
  return out;
}

function americanToDecimal(o) {
  return o > 0 ? 1 + o / 100 : 1 + 100 / -o;
}

// ========================================================
//  API WRAPPERS
// ========================================================
const api = {
  events: () => fetch("/api/events").then(r => r.json()),
  odds:   () => fetch("/api/odds").then(r => r.json()),
  props:  id => fetch(`/api/event-odds?eventId=${id}`).then(r => r.json()),
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
  gamesEl.textContent = "Loading NFL data…";

  try {
    const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
    const odds = oddsWrap.data ?? oddsWrap;
    const byId = Object.fromEntries(odds.map(o => [o.id, o]));

    const cutoff = 4 * 60 * 60 * 1000;
    const now = Date.now();

    const valid = events.filter(ev => {
      const game = byId[ev.id];
      if (!game) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoff;
    });

    gamesEl.innerHTML = "";
    valid.forEach(ev => gamesEl.appendChild(renderGame(ev, byId[ev.id])));
  } catch (err) {
    console.error(err);
    gamesEl.textContent = "Failed to load NFL data.";
  }
}

// ========================================================
//  BUILD GAME CARD
// ========================================================
function renderGame(ev, odds) {
  const card = document.createElement("div");
  card.className = "card";
  card.id = ev.id;

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
    <div class="tab-content" id="props"><em>Loading…</em></div>
  `;

  const header = $(".card-header", card);

  // Logos
  const home = NFL_TEAMS[ev.home_team];
  const away = NFL_TEAMS[ev.away_team];

  header.insertAdjacentHTML(
    "afterbegin",
    `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <img src="${away?.logo || ""}" style="height:44px;" />
        <span style="flex:1;"></span>
        <img src="${home?.logo || ""}" style="height:44px;" />
      </div>
    `
  );

  // Theme
  if (home) {
    card.style.background = `linear-gradient(135deg, ${home.primary}, ${home.secondary}, #0d1228)`;
    card.style.borderColor = home.secondary;
  }

  // Analytics
  const ana = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  header.insertAdjacentHTML("beforeend", analyticsHTML(ana));

  // Lines
  renderLines($("#lines", card), odds, ana, ev);

  // Tab switching
  $$(".tab", card).forEach(tab =>
    tab.addEventListener("click", () => {
      $$(".tab", card).forEach(t => t.classList.remove("active"));
      $$(".tab-content", card).forEach(c => c.classList.remove("active"));
  
      tab.classList.add("active");
      $("#" + tab.dataset.tab, card).classList.add("active");

      if (tab.dataset.tab === "props") {
        renderProps(ev, $("#" + tab.dataset.tab, card));
      }
    })
  );

  return card;
}

// ========================================================
//  ANALYTICS
// ========================================================
function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers ?? [];

  const mlAway = [], mlHome = [];
  const spread = [], totals = [];

  books.forEach(bm =>
    (bm.markets ?? []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === away);
        const h = m.outcomes.find(o => o.name === home);
        if (a && h) {
          mlAway.push(prob(a.price));
          mlHome.push(prob(h.price));
        }
      }
      if (m.key === "spreads") spread.push(...m.outcomes);
      if (m.key === "totals") totals.push(...m.outcomes);
    })
  );

  const [nvAway, nvHome] = noVig(avg(mlAway), avg(mlHome));
  const spreadGroups = groupByPoint(spread);
  const totalGroups = groupByPoint(totals);

  const bestSpread = Object.entries(spreadGroups)
    .sort((a,b) => avg(b[1]) - avg(a[1]))[0];
  const bestTotal = Object.entries(totalGroups)
    .sort((a,b) => avg(b[1]) - avg(a[1]))[0];

  return {
    away,
    home,
    nvAway,
    nvHome,
    winner: nvAway > nvHome ? away : home,
    winnerProb: Math.max(nvAway, nvHome),
    bestSpread: bestSpread?.[0],
    bestSpreadProb: bestSpread ? avg(bestSpread[1]) : 0,
    bestTotal: bestTotal?.[0],
    bestTotalProb: bestTotal ? avg(bestTotal[1]) : 0,
  };
}

function analyticsHTML(a) {
  const [sTeam, sLine] = a.bestSpread?.split(":") ?? ["", ""];
  const [tSide, tLine] = a.bestTotal?.split(":") ?? ["", ""];

  return `
    <div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.25);">
      <div style="color:#ffcc33;font-weight:600;margin-bottom:6px;">📊 EmpirePicks Forecast</div>
      <div style="font-size:0.83rem;">
        • <strong>${a.winner}</strong> favored at ${(a.winnerProb * 100).toFixed(1)}%<br><br>
        • Spread: ${sTeam} ${sLine} (${(a.bestSpreadProb * 100).toFixed(1)}%)<br><br>
        • Total: ${tSide} ${tLine} (${(a.bestTotalProb * 100).toFixed(1)}%)
      </div>
    </div>
  `;
}

// ========================================================
//  GAME LINES (ML + SPREAD + TOTAL)
//  Fully compatible with Parlay Maker
// ========================================================
function renderLines(container, game, ana, ev) {
  const rows = [];

  (game.bookmakers ?? []).forEach(bm => {
    const rec = { book: bm.title, moneyline: "–", spread: "–", total: "–" };

    (bm.markets ?? []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === ana.away);
        const h = m.outcomes.find(o => o.name === ana.home);

        if (a && h) {
          rec.moneyline = `
            ${money(a.price)} / ${money(h.price)}
            <div style="margin-top:4px;display:flex;gap:6px;">
              <button class="add-leg"
                data-market="ML"
                data-team="${ana.away}"
                data-price="${a.price}"
                data-trueprob="${ana.nvAway}"
                data-game="${ev.away_team} @ ${ev.home_team}"
              >➕ ${ana.away}</button>

              <button class="add-leg"
                data-market="ML"
                data-team="${ana.home}"
                data-price="${h.price}"
                data-trueprob="${ana.nvHome}"
                data-game="${ev.away_team} @ ${ev.home_team}"
              >➕ ${ana.home}</button>
            </div>
          `;
        }
      }

      if (m.key === "spreads") {
        const best = m.outcomes.sort((x,y) => Math.abs(x.point - Number(ana.bestSpread?.split(":")[1] ?? 0)) - Math.abs(y.point - Number(ana.bestSpread?.split(":")[1] ?? 0)))[0];
        rec.spread = `${best.name} ${best.point} (${money(best.price)})`;
      }

      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        rec.total = `O${over?.point ?? ""} / U${under?.point ?? ""}`;
      }
    });

    rows.push(rec);
  });

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(r => `
            <tr>
              <td>${r.book}</td>
              <td>${r.moneyline}</td>
              <td>${r.spread}</td>
              <td>${r.total}</td>
            </tr>
          `)
          .join("")}
      </tbody>
    </table>
  `;
}

// ========================================================
//  PLAYER PROPS (CLEAN, GROUPED, PARLAY-SAFE)
// ========================================================
async function renderProps(ev, container) {
  container.textContent = "Loading props…";

  try {
    const wrap = await api.props(ev.id);
    const props = wrap.props ?? wrap;
    if (!props?.bookmakers) {
      container.textContent = "No props available.";
      return;
    }

    const groups = {};

    props.bookmakers.forEach(bm =>
      (bm.markets ?? []).forEach(m =>
        m.outcomes.forEach(o => {
          const key = `${m.key}:${o.description}:${o.point}`;
          (groups[key] ||= []).push({
            book: bm.title,
            player: o.description,
            name: o.name,
            point: o.point,
            stat: m.key,
            price: o.price,
            p: prob(o.price),
          });
        })
      )
    );

    let html = "";

    Object.values(groups).forEach(arr => {
      const player = arr[0].player;
      const stat = arr[0].stat;
      const point = arr[0].point;

      const over = arr.filter(x => x.name === "Over");
      const under = arr.filter(x => x.name === "Under");

      const bestOver = over.sort((a, b) => Math.abs(a.price) - Math.abs(b.price))[0];
      const bestUnder = under.sort((a, b) => Math.abs(a.price) - Math.abs(b.price))[0];

      const avgOver = avg(over.map(x => x.p));
      const avgUnder = avg(under.map(x => x.p));
      const [nvO, nvU] = noVig(avgOver, avgUnder);

      html += `
        <div style="padding:10px;background:#0d1228;border-radius:8px;margin-bottom:10px;">
          <strong style="color:var(--gold);">${player}</strong>
          <span style="color:#9ca7c8;">${stat.replace("player_", "").replace(/_/g," ")}</span>
          <br>

          <div style="margin-top:6px;display:flex;justify-content:space-between;">
            <div>Over ${point} (${money(bestOver.price)}) <span style="color:#28d16c;">${(nvO*100).toFixed(1)}%</span></div>
            <button class="add-leg"
              data-market="PROP"
              data-player="${player}"
              data-type="${stat}"
              data-side="Over"
              data-point="${point}"
              data-price="${bestOver.price}"
              data-trueprob="${nvO}"
              data-game="${ev.away_team} @ ${ev.home_team}"
              style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:#141a33;color:var(--gold);"
            >➕</button>
          </div>

          <div style="margin-top:6px;display:flex;justify-content:space-between;">
            <div>Under ${point} (${money(bestUnder.price)}) <span style="color:#9ca7c8;">${(nvU*100).toFixed(1)}%</span></div>
            <button class="add-leg"
              data-market="PROP"
              data-player="${player}"
              data-type="${stat}"
              data-side="Under"
              data-point="${point}"
              data-price="${bestUnder.price}"
              data-trueprob="${nvU}"
              data-game="${ev.away_team} @ ${ev.home_team}"
              style="padding:4px 8px;border-radius:6px;border:1px solid var(--border);background:#141a33;color:var(--gold);"
            >➕</button>
          </div>
        </div>
      `;
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

// ========================================================
//  EXPORT FOR DASHBOARD
// ========================================================
export { computeGameAnalytics, prob, americanToDecimal, money };
