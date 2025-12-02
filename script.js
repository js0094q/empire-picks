// ========================================================
//  IMPORT TEAM COLORS + LOGOS
// ========================================================
import { NFL_TEAMS } from "./teams.js";

// ========================================================
//  SMALL HELPERS
// ========================================================
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = o => o > 0 ? `+${o}` : o;

function prob(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

function noVig(p1, p2) {
  const total = p1 + p2;
  if (!total) return [0.5, 0.5];
  return [p1 / total, p2 / total];
}

const avg = arr =>
  arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

function groupByPoint(arr) {
  const out = {};
  arr.forEach(o => {
    const key = `${o.name}:${o.point}`;
    if (!out[key]) out[key] = [];
    out[key].push(prob(o.price));
  });
  return out;
}

// ========================================================
//  API WRAPPERS
// ========================================================
const api = {
  async events() {
    const r = await fetch("/api/events");
    if (!r.ok) throw new Error("Failed to load events");
    return r.json();
  },
  async odds() {
    const r = await fetch("/api/odds");
    if (!r.ok) throw new Error("Failed to load odds");
    return r.json();
  },
  async props(id) {
    const r = await fetch(`/api/event-odds?eventId=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error("Failed to load props");
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
const countdown = getCountdownString(ev.commence_time);

// FIXED kickoff time (local EST instead of UTC)
const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit"
});

// Build card
const card = document.createElement("div");
card.className = "game-card";

card.innerHTML = `
  <div class="game-header">
      <div class="teams">${ev.away_team} @ ${ev.home_team}</div>
      <div class="kickoff">Kickoff: ${kickoffLocal}</div>
      <div class="countdown">⏳ ${countdown}</div>
  </div>
  
  <!-- rest of your card stays unchanged -->
`;

    gamesEl.innerHTML = "";
    validGames.forEach(ev => gamesEl.appendChild(renderGame(ev, byId[ev.id])));

  } catch (err) {
    console.error(err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

// ========================================================
//  BUILD A SINGLE GAME CARD
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

  const header = card.querySelector(".card-header");

  // ---------- Team logos + color theme ----------
  const home = NFL_TEAMS[ev.home_team];
  const away = NFL_TEAMS[ev.away_team];

  if (home && away) {
    header.insertAdjacentHTML(
      "afterbegin",
      `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <img src="${away.logo}" style="height:44px;width:auto;">
        <span style="flex:1;"></span>
        <img src="${home.logo}" style="height:44px;width:auto;">
      </div>
      `
    );
  }

  if (home) {
    card.style.background = `linear-gradient(135deg, ${home.primary} 0%, ${home.secondary} 45%, #0d1228 95%)`;
    card.style.borderColor = home.secondary;
    card.querySelectorAll(".tab").forEach(t => {
      t.style.borderBottom = `2px solid ${home.primary}`;
      t.style.color = "#fff";
    });
  }

  // ---------- Analytics block ----------
  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  header.insertAdjacentHTML("beforeend", analyticsHTML(analytics));

  // ---------- Lines table ----------
  renderLines($("#lines", card), odds, analytics);

  // ---------- Tabs behaviour ----------
  $$(".tab", card).forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab", card).forEach(t => t.classList.remove("active"));
      $$(".tab-content", card).forEach(c => c.classList.remove("active"));

      tab.classList.add("active");
      const content = card.querySelector(`#${tab.dataset.tab}`);
      content.classList.add("active");

      if (tab.dataset.tab === "props" && !content.dataset.loaded) {
        loadProps(ev.id, content);
      }
    });
  });

  return card;
}

// ========================================================
//  GAME ANALYTICS ENGINE (WIN %, SPREAD %, TOTAL %)
// ========================================================
function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers || [];

  const mlAway = [];
  const mlHome = [];
  const spread = [];
  const totals = [];

  books.forEach(bm => {
    (bm.markets || []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === away);
        const h = m.outcomes.find(o => o.name === home);
        if (a && h) {
          mlAway.push(prob(a.price));
          mlHome.push(prob(h.price));
        }
      }
      if (m.key === "spreads") {
        m.outcomes.forEach(o => spread.push(o));
      }
      if (m.key === "totals") {
        m.outcomes.forEach(o => totals.push(o));
      }
    });
  });

  const avgAway = avg(mlAway);
  const avgHome = avg(mlHome);
  const [nvAway, nvHome] = noVig(avgAway, avgHome);

  const winner = nvAway > nvHome ? away : home;
  const winnerProb = Math.max(nvAway, nvHome);

  const spreadGroups = groupByPoint(spread);
  let bestSpread = null;
  let bestSpreadProb = 0;

  Object.entries(spreadGroups).forEach(([k, arr]) => {
    const p = avg(arr);
    if (p > bestSpreadProb) {
      bestSpreadProb = p;
      bestSpread = k;
    }
  });

  const totalGroups = groupByPoint(totals);
  let bestTotal = null;
  let bestTotalProb = 0;

  Object.entries(totalGroups).forEach(([k, arr]) => {
    const p = avg(arr);
    if (p > bestTotalProb) {
      bestTotalProb = p;
      bestTotal = k;
    }
  });

  return {
    away,
    home,
    nvAway,
    nvHome,
    winner,
    winnerProb,
    bestSpread,
    bestSpreadProb,
    bestTotal,
    bestTotalProb
  };
}

// ========================================================
//  ANALYTICS HTML BLOCK
// ========================================================
function analyticsHTML(a) {
  const [spreadTeam, spreadLine] = a.bestSpread ? a.bestSpread.split(":") : ["", ""];
  const [totalSide, totalLine] = a.bestTotal ? a.bestTotal.split(":") : ["", ""];

  return `
    <div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.25);">
      <div style="color:#ffcc33;font-weight:600;margin-bottom:6px;font-size:0.92rem;">
        📊 EmpirePicks Forecast
      </div>

      <div style="font-size:0.83rem;line-height:1.35;">
        <strong>Win Probability:</strong><br>
        • ${a.winner} favored at ${(a.winnerProb * 100).toFixed(1)}%<br><br>

        <strong>Spread Consensus:</strong><br>
        • ${spreadTeam} ${spreadLine}
        (${(a.bestSpreadProb * 100).toFixed(1)}% confidence)<br><br>

        <strong>Total Consensus:</strong><br>
        • ${totalSide} ${totalLine}
        (${(a.bestTotalProb * 100).toFixed(1)}% confidence)
      </div>
    </div>
  `;
}

// ========================================================
//  LINES + EV BEST BET
// ========================================================
function renderLines(container, game, analytics) {
  const rows = [];

  (game.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      moneyline: "–",
      spread: "–",
      total: "–",
      edge: null
    };

    let rowEdge = null;

    (bm.markets || []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === analytics.away);
        const h = m.outcomes.find(o => o.name === analytics.home);
        if (a && h) {
          rec.moneyline = `${money(a.price)} / ${money(h.price)}`;

          const pA = prob(a.price);
          const pH = prob(h.price);

          rowEdge = Math.max(
            analytics.nvAway - pA,
            analytics.nvHome - pH
          );
        }
      }

      if (m.key === "spreads") {
        let best = null;
        if (analytics.bestSpread) {
          const [, line] = analytics.bestSpread.split(":");
          const ln = Number(line);
          best = m.outcomes
            .slice()
            .sort((x, y) => Math.abs(x.point - ln) - Math.abs(y.point - ln))[0];
        }
        if (!best) {
          best = m.outcomes
            .slice()
            .sort((x, y) => Math.abs(x.point) - Math.abs(y.point))[0];
        }
        if (best) {
          rec.spread = `${best.name} ${best.point} (${money(best.price)})`;
        }
      }

      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name.toLowerCase() === "over");
        const under = m.outcomes.find(o => o.name.toLowerCase() === "under");
        if (over && under) {
          rec.total = `O${over.point} / U${under.point}`;
        }
      }
    });

    rec.edge = rowEdge;
    rows.push(rec);
  });

  let bestIndex = -1;
  let bestEdge = 0;

  rows.forEach((r, i) => {
    if (typeof r.edge === "number" && r.edge > bestEdge + 0.003) {
      bestEdge = r.edge;
      bestIndex = i;
    }
  });

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Book</th>
          <th>Moneyline</th>
          <th>Spread</th>
          <th>Total</th>
          <th>EV vs Market</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r, i) => `
          <tr>
            <td>${r.book}</td>
            <td>${r.moneyline}</td>
            <td>${r.spread}</td>
            <td>${r.total}</td>
            <td>
              ${
                typeof r.edge === "number"
                  ? `${(r.edge * 100).toFixed(1)}%`
                  : ""
              }
              ${
                i === bestIndex && bestEdge > 0.01
                  ? `<span class="ev-pos" style="margin-left:6px;font-weight:700;">⭐ Best Bet</span>`
                  : ""
              }
            </td>
          </tr>
        `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// ========================================================
//  PLAYER PROPS
// ========================================================
async function loadProps(id, container) {
  container.dataset.loaded = "1";
  container.textContent = "Loading props…";

  try {
    const wrap = await api.props(id);
    const props = wrap.props ?? wrap;

    if (!props || !props.bookmakers) {
      container.textContent = "No props available.";
      return;
    }

    const groups = {};

    props.bookmakers.forEach(bm => {
      (bm.markets || []).forEach(m => {
        if (!groups[m.key]) groups[m.key] = [];
        m.outcomes.forEach(o => {
          groups[m.key].push({
            book: bm.title,
            player: o.description || "–",
            name: o.name,
            point: o.point,
            price: o.price,
            p: prob(o.price)
          });
        });
      });
    });

    const order = [
      "player_anytime_td",
      "player_pass_tds",
      "player_pass_yds",
      "player_rush_yds",
      "player_receptions"
    ];

    let html = "";

    order.forEach(key => {
      const arr = groups[key];
      if (!arr) return;

      const summary = computePropConsensus(arr);

      html += `<h3 style="margin-top:1rem;">${label(key)} Forecast</h3>`;
      html += `<div style="font-size:0.85rem;margin-bottom:0.6rem;">`;

      summary.slice(0, 8).forEach(s => {
        html += `
          <div>
            ⭐ <strong>${s.player}</strong> ${s.favorite} ${s.point ?? ""} 
            (${(s.bestProb * 100).toFixed(1)}% consensus)
          </div>
        `;
      });

      html += `</div>`;

      html += `
        <table class="table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Player</th>
              <th>Pick</th>
              <th>Line</th>
              <th>Price</th>
              <th>Implied Prob</th>
            </tr>
          </thead>
          <tbody>
            ${arr
              .slice(0, 60)
              .map(
                r => `
              <tr>
                <td>${r.book}</td>
                <td>${r.player}</td>
                <td>${r.name}</td>
                <td>${r.point ?? "–"}</td>
                <td>${money(r.price)}</td>
                <td>${(r.p * 100).toFixed(1)}%</td>
              </tr>
            `
              )
              .join("")}
          </tbody>
        </table>
      `;
    });

    container.innerHTML = html || "No props available.";
  } catch (err) {
    console.error(err);
    container.textContent = "Failed to load props.";
  }
}

// ========================================================
//  PROP CONSENSUS ENGINE
// ========================================================
function computePropConsensus(arr) {
  const map = {};

  arr.forEach(r => {
    const key = `${r.player}:${r.point}`;
    if (!map[key]) map[key] = { over: [], under: [] };

    const side = r.name.toLowerCase();
    if (side === "over") map[key].over.push(r.p);
    if (side === "under") map[key].under.push(r.p);
  });

  const res = [];

  Object.entries(map).forEach(([key, v]) => {
    const [player, point] = key.split(":");

    const avgO = avg(v.over);
    const avgU = avg(v.under);

    const [nvO, nvU] = noVig(avgO, avgU);
    const fav = nvO >= nvU ? "Over" : "Under";
    const bestProb = fav === "Over" ? nvO : nvU;

    res.push({ player, point, favorite: fav, bestProb });
  });

  return res.sort((a, b) => b.bestProb - a.bestProb);
}

function label(k) {
  return (
    {
      player_anytime_td: "Anytime TD",
      player_pass_tds: "Passing TDs",
      player_pass_yds: "Passing Yards",
      player_rush_yds: "Rushing Yards",
      player_receptions: "Receptions"
    }[k] || k
  );
}

// ========================================================
//  STARTUP
// ========================================================
loadAll();

// ========================================================
//  EXPORT FOR DASHBOARD
// ========================================================
export { computeGameAnalytics };
