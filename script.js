// ========================================================
//  IMPORT TEAM COLORS + LOGOS
// ========================================================
import { NFL_TEAMS } from "./teams.js";

// ========================================================
//  SMALL HELPERS
// ========================================================
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = o => (o > 0 ? `+${o}` : o);

function prob(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

function probToAmerican(p) {
  if (!p) return 0;
  if (p >= 1) return -100000; // degenerate, just guard
  if (p <= 0) return 100000;
  // if favorite (p > 0.5) use negative odds
  return p > 0.5
    ? Math.round(-(p / (1 - p)) * 100)
    : Math.round(((1 - p) / p) * 100);
}

function noVig(p1, p2) {
  const total = p1 + p2;
  if (!total) return [0.5, 0.5];
  return [p1 / total, p2 / total];
}

const avg = arr =>
  arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;

// Movement formatting
const pct = x => `${(x * 100).toFixed(1)}%`;
const moveArrow = d => (d > 0.004 ? "↑" : d < -0.004 ? "↓" : "→");

// ========================================================
//  PERSIST OPENERS IN LOCALSTORAGE
// ========================================================
const OPENERS_KEY = "empirepicks_openers_v1";

function loadOpeners() {
  try {
    const raw = localStorage.getItem(OPENERS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveOpeners(obj) {
  try {
    localStorage.setItem(OPENERS_KEY, JSON.stringify(obj));
  } catch {
    // ignore
  }
}

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
    const r = await fetch(`/api/event-odds?eventId=${encodeURIComponent(id)}`);
    if (!r.ok) throw new Error("PROPS API FAILED");
    return r.json();
  }
};

// ========================================================
//  ROOT + REFRESH
// ========================================================
const gamesEl = $("#games");
let parlayRoot = $("#bestParlay");
let PARLAY_POOL = [];

$("#refreshBtn").addEventListener("click", loadAll);

// ========================================================
//  MAIN LOAD
// ========================================================
async function loadAll() {
  gamesEl.textContent = "Loading NFL week data…";
  PARLAY_POOL = [];

  try {
    const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);

    // Handle both bare array and { data: [...] } shape
    let odds;
    if (Array.isArray(oddsWrap)) odds = oddsWrap;
    else if (Array.isArray(oddsWrap?.data)) odds = oddsWrap.data;
    else odds = [];

    const byId = Object.fromEntries(odds.map(g => [g.id, g]));
    const validGames = events.filter(ev => byId[ev.id]);

    // Ensure Best Parlay container exists
    if (!parlayRoot) {
      parlayRoot = document.createElement("section");
      parlayRoot.id = "bestParlay";
      parlayRoot.className = "card";
      parlayRoot.style.marginBottom = "1rem";
      if (gamesEl.parentNode) {
        gamesEl.parentNode.insertBefore(parlayRoot, gamesEl);
      }
    }

    gamesEl.innerHTML = "";
    validGames.forEach(ev => {
      const card = renderGame(ev, byId[ev.id]);
      gamesEl.appendChild(card);
    });

    renderBestParlay();

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

  const home = NFL_TEAMS[ev.home_team];
  const away = NFL_TEAMS[ev.away_team];

  // Logos
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

  // Theme
  if (home) {
    card.style.background = `linear-gradient(135deg, ${home.primary} 0%, ${home.secondary} 45%, #0d1228 95%)`;
    card.style.borderColor = home.secondary;
    card.querySelectorAll(".tab").forEach(t => {
      t.style.borderBottom = `2px solid ${home.primary}`;
      t.style.color = "#fff";
    });
  }

  // Analytics
  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  header.insertAdjacentHTML("beforeend", analyticsHTML(analytics));

  // Lines + movement + parlay pool
  renderLines($("#lines", card), odds, analytics, ev.id);

  // Tabs
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
//  GAME ANALYTICS ENGINE (WIN %, SPREAD, TOTAL, PROJECTION)
// ========================================================
function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers || [];

  const mlAway = [];
  const mlHome = [];
  const homeSpreads = [];
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
        const h = m.outcomes.find(o => o.name === home);
        if (h && typeof h.point === "number") {
          homeSpreads.push(h.point);
        }
      }

      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name.toLowerCase() === "over");
        if (over && typeof over.point === "number") {
          totals.push(over.point);
        }
      }
    });
  });

  const avgAway = avg(mlAway);
  const avgHome = avg(mlHome);
  const [nvAway, nvHome] = noVig(avgAway, avgHome);

  const winner = nvAway > nvHome ? away : home;
  const winnerProb = Math.max(nvAway, nvHome);

  const consensusSpread =
    homeSpreads.length ? avg(homeSpreads) : null;
  const consensusTotal =
    totals.length ? avg(totals) : null;

  let projHome = null;
  let projAway = null;

  if (consensusSpread != null && consensusTotal != null) {
    // Let s = home spread, T = total
    // H - A = -s ; H + A = T
    const H = (consensusTotal - consensusSpread) / 2;
    const A = (consensusTotal + consensusSpread) / 2;
    projHome = H;
    projAway = A;
  }

  return {
    away,
    home,
    nvAway,
    nvHome,
    winner,
    winnerProb,
    consensusSpread,
    consensusTotal,
    projHome,
    projAway
  };
}

// ========================================================
//  ANALYTICS HTML: WIN GAUGES + PROJECTION
// ========================================================
function analyticsHTML(a) {
  const awayPct = a.nvAway * 100;
  const homePct = a.nvHome * 100;

  const projBlock =
    a.projHome != null && a.projAway != null
      ? `
    <div style="margin-top:6px;font-size:0.82rem;">
      <strong>Projected Scoreline:</strong><br>
      • ${a.away}: ${a.projAway.toFixed(1)} pts<br>
      • ${a.home}: ${a.projHome.toFixed(1)} pts
    </div>
  `
      : "";

  const spreadTotalBlock =
    a.consensusSpread != null && a.consensusTotal != null
      ? `
    <div style="margin-top:6px;font-size:0.8rem;">
      <strong>Consensus Line:</strong><br>
      • Spread: ${a.home} ${a.consensusSpread > 0 ? "+" : ""}${a.consensusSpread.toFixed(1)}<br>
      • Total: ${a.consensusTotal.toFixed(1)}
    </div>
  `
      : "";

  return `
    <div style="margin-top:8px;padding:8px;border-radius:8px;background:rgba(0,0,0,0.25);">
      <div style="color:#ffcc33;font-weight:600;margin-bottom:6px;font-size:0.92rem;">
        📊 EmpirePicks Forecast
      </div>

      <div style="font-size:0.83rem;line-height:1.35;margin-bottom:6px;">
        <strong>Win Probability:</strong><br>
        • ${a.winner} favored at ${(a.winnerProb * 100).toFixed(1)}%
      </div>

      <div style="font-size:0.8rem;margin-bottom:4px;">Implied Win %</div>
      <div style="display:flex;flex-direction:column;gap:4px;font-size:0.78rem;">
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:70px;">${a.away}</span>
          <div style="flex:1;background:rgba(255,255,255,0.15);border-radius:999px;overflow:hidden;height:8px;">
            <div style="width:${awayPct.toFixed(1)}%;height:100%;background:#ffcc33;"></div>
          </div>
          <span style="width:42px;text-align:right;">${awayPct.toFixed(1)}%</span>
        </div>
        <div style="display:flex;align-items:center;gap:6px;">
          <span style="width:70px;">${a.home}</span>
          <div style="flex:1;background:rgba(255,255,255,0.15);border-radius:999px;overflow:hidden;height:8px;">
            <div style="width:${homePct.toFixed(1)}%;height:100%;background:#ffcc33;"></div>
          </div>
          <span style="width:42px;text-align:right;">${homePct.toFixed(1)}%</span>
        </div>
      </div>

      ${spreadTotalBlock}
      ${projBlock}
    </div>
  `;
}

// ========================================================
//  LINES + MOVEMENT + PARLAY POOL
//  (ONE ROW PER BOOK, BEST AVAILABLE LINES)
// ========================================================
function renderLines(container, game, analytics, gameId) {
  const rows = [];
  const gameLabel = `${analytics.away} @ ${analytics.home}`;

  (game.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      moneyline: "–",
      mlAway: null,
      mlHome: null,
      spread: "–",
      total: "–",
      edge: null,
      bestSideTeam: null,
      bestSideTrueProb: null,
      bestSidePrice: null
    };

    const markets = bm.markets || [];

    // Moneyline
    const h2h = markets.find(m => m.key === "h2h");
    if (h2h) {
      const a = h2h.outcomes.find(o => o.name === analytics.away);
      const h = h2h.outcomes.find(o => o.name === analytics.home);
      if (a && h) {
        rec.moneyline = `${money(a.price)} / ${money(h.price)}`;
        rec.mlAway = a.price;
        rec.mlHome = h.price;

        const pA = prob(a.price);
        const pH = prob(h.price);
        const edgeA = analytics.nvAway - pA;
        const edgeH = analytics.nvHome - pH;

        if (edgeA >= edgeH) {
          rec.edge = edgeA;
          rec.bestSideTeam = analytics.away;
          rec.bestSideTrueProb = analytics.nvAway;
          rec.bestSidePrice = a.price;
        } else {
          rec.edge = edgeH;
          rec.bestSideTeam = analytics.home;
          rec.bestSideTrueProb = analytics.nvHome;
          rec.bestSidePrice = h.price;
        }
      }
    }

    // Spread (pick closest to consensus home spread if we have it, else smallest abs)
    const spreadsMarket = markets.find(m => m.key === "spreads");
    if (spreadsMarket && spreadsMarket.outcomes.length) {
      let bestSpreadOutcome = null;
      if (analytics.consensusSpread != null) {
        const target = analytics.consensusSpread;
        bestSpreadOutcome = spreadsMarket.outcomes
          .slice()
          .sort(
            (x, y) =>
              Math.abs((x.name === analytics.home ? x.point : -x.point) - target) -
              Math.abs((y.name === analytics.home ? y.point : -y.point) - target)
          )[0];
      } else {
        bestSpreadOutcome = spreadsMarket.outcomes
          .slice()
          .sort((x, y) => Math.abs(x.point) - Math.abs(y.point))[0];
      }

      if (bestSpreadOutcome) {
        rec.spread = `${bestSpreadOutcome.name} ${bestSpreadOutcome.point} (${money(
          bestSpreadOutcome.price
        )})`;
      }
    }

    // Totals
    const totalsMarket = markets.find(m => m.key === "totals");
    if (totalsMarket && totalsMarket.outcomes.length >= 2) {
      const over = totalsMarket.outcomes.find(
        o => o.name.toLowerCase() === "over"
      );
      const under = totalsMarket.outcomes.find(
        o => o.name.toLowerCase() === "under"
      );
      if (over && under) {
        rec.total = `O${over.point} / U${under.point}`;
      }
    }

    rows.push(rec);
  });

  // Best EV book for parlay pool
  let bestIndex = -1;
  let bestEdge = 0;

  rows.forEach((r, i) => {
    if (typeof r.edge === "number" && r.edge > bestEdge + 0.0001) {
      bestEdge = r.edge;
      bestIndex = i;
    }
  });

  if (bestIndex >= 0 && rows[bestIndex].edge > 0.01) {
    const r = rows[bestIndex];
    if (r.bestSideTeam && r.bestSideTrueProb && r.bestSidePrice != null) {
      PARLAY_POOL.push({
        type: "ML",
        team: r.bestSideTeam,
        game: gameLabel,
        price: r.bestSidePrice,
        trueProb: r.bestSideTrueProb,
        edge: r.edge
      });
    }
  }

  // Consensus opener vs current movement
  const openers = loadOpeners();
  if (!openers[gameId]) {
    openers[gameId] = {
      mlAway: analytics.nvAway,
      mlHome: analytics.nvHome,
      spread: analytics.consensusSpread,
      total: analytics.consensusTotal
    };
    saveOpeners(openers);
  }

  const op = openers[gameId] || {};
  const mlMoveAway = analytics.nvAway - (op.mlAway ?? analytics.nvAway);
  const mlMoveHome = analytics.nvHome - (op.mlHome ?? analytics.nvHome);
  const spreadMove =
    analytics.consensusSpread != null && op.spread != null
      ? analytics.consensusSpread - op.spread
      : 0;
  const totalMove =
    analytics.consensusTotal != null && op.total != null
      ? analytics.consensusTotal - op.total
      : 0;

  const openerBlock =
    op.spread != null && op.total != null
      ? `
    <div style="margin-bottom:8px;font-size:0.8rem;">
      <strong>Consensus Openers vs Current:</strong><br>
      • ${analytics.away} win prob: ${pct(analytics.nvAway)} ${moveArrow(mlMoveAway)}<br>
      • ${analytics.home} win prob: ${pct(analytics.nvHome)} ${moveArrow(mlMoveHome)}<br>
      • Spread: ${analytics.home} ${op.spread > 0 ? "+" : ""}${op.spread.toFixed(
          1
        )} → ${analytics.home} ${analytics.consensusSpread > 0 ? "+" : ""}${analytics.consensusSpread.toFixed(
          1
        )} (${spreadMove > 0 ? "+" : ""}${spreadMove.toFixed(1)} pts)<br>
      • Total: ${op.total.toFixed(1)} → ${analytics.consensusTotal.toFixed(
          1
        )} (${totalMove > 0 ? "+" : ""}${totalMove.toFixed(1)} pts)
    </div>
  `
      : "";

  container.innerHTML = `
    ${openerBlock}
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
        ${rows
          .map(
            (r, i) => `
          <tr>
            <td>${r.book}</td>
            <td>
              ${r.moneyline}
              ${
                r.mlAway != null && r.mlHome != null
                  ? `
                <div style="margin-top:4px;font-size:0.78rem;display:flex;gap:4px;flex-wrap:wrap;">
                  <button
                    class="add-leg"
                    data-market="ML"
                    data-team="${analytics.away}"
                    data-price="${r.mlAway}"
                    data-trueprob="${analytics.nvAway}"
                    data-game="${gameLabel}"
                    style="padding:2px 6px;border-radius:6px;font-size:0.75rem;"
                  >
                    ➕ ${analytics.away}
                  </button>
                  <button
                    class="add-leg"
                    data-market="ML"
                    data-team="${analytics.home}"
                    data-price="${r.mlHome}"
                    data-trueprob="${analytics.nvHome}"
                    data-game="${gameLabel}"
                    style="padding:2px 6px;border-radius:6px;font-size:0.75rem;"
                  >
                    ➕ ${analytics.home}
                  </button>
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
                  ? `${(r.edge * 100).toFixed(1)}%`
                  : ""
              }
              ${
                i === bestIndex && bestEdge > 0
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
//  PLAYER PROPS + PARLAY BUTTONS
// ========================================================
async function loadProps(id, container) {
  container.dataset.loaded = "1";
  container.textContent = "Loading props…";

  try {
    const wrap = await api.props(id);
    const propsObj = wrap.props ?? wrap;

    if (!propsObj || !propsObj.bookmakers) {
      container.textContent = "No props available.";
      return;
    }

    const props = propsObj.bookmakers;
    const gameLabel = `${propsObj.away_team} @ ${propsObj.home_team}`;

    const groups = {};

    props.forEach(bm => {
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

    // Build no-vig map per player/point/side (Over/Under)
    const nvMap = {};
    Object.values(groups).forEach(arr => {
      const byLine = {};
      arr.forEach(r => {
        const lineKey = `${r.player}:${r.point}`;
        if (!byLine[lineKey]) byLine[lineKey] = { over: [], under: [] };
        const side = r.name.toLowerCase();
        if (side === "over") byLine[lineKey].over.push(r.p);
        if (side === "under") byLine[lineKey].under.push(r.p);
      });

      Object.entries(byLine).forEach(([lineKey, v]) => {
        const avgO = avg(v.over);
        const avgU = avg(v.under);
        if (!avgO && !avgU) return;
        const [nvO, nvU] = noVig(avgO, avgU);
        nvMap[`${lineKey}:Over`] = nvO;
        nvMap[`${lineKey}:Under`] = nvU;
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
            ⭐ <strong>${s.player}</strong> ${s.favorite} ${
          s.point ?? ""
        } 
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
              <th>Parlay</th>
            </tr>
          </thead>
          <tbody>
            ${arr
              .slice(0, 60)
              .map(r => {
                const sideLabel =
                  r.name.toLowerCase() === "over"
                    ? "Over"
                    : r.name.toLowerCase() === "under"
                    ? "Under"
                    : r.name;
                const nvKey = `${r.player}:${r.point}:${sideLabel}`;
                const trueProb =
                  nvMap[nvKey] !== undefined ? nvMap[nvKey] : r.p;

                return `
              <tr>
                <td>${r.book}</td>
                <td>${r.player}</td>
                <td>${r.name}</td>
                <td>${r.point ?? "–"}</td>
                <td>${money(r.price)}</td>
                <td>${(r.p * 100).toFixed(1)}%</td>
                <td>
                  <button
                    class="add-leg"
                    data-market="PROP"
                    data-player="${r.player}"
                    data-type="${key}"
                    data-side="${sideLabel}"
                    data-point="${r.point ?? ""}"
                    data-price="${r.price}"
                    data-trueprob="${trueProb}"
                    data-game="${gameLabel}"
                    style="padding:2px 6px;border-radius:6px;font-size:0.75rem;"
                  >
                    ➕ Add
                  </button>
                </td>
              </tr>
            `;
              })
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
//  BEST PARLAY OF THE WEEK
// ========================================================
function renderBestParlay() {
  if (!parlayRoot) return;

  if (!PARLAY_POOL.length) {
    parlayRoot.innerHTML = `
      <h2>🔥 Best Parlay of the Week</h2>
      <p style="font-size:0.88rem;">No clear +EV legs detected yet. Check back after lines settle.</p>
    `;
    return;
  }

  const sorted = [...PARLAY_POOL].sort((a, b) => b.edge - a.edge);

  const picked = [];
  const usedGames = new Set();

  for (const leg of sorted) {
    if (usedGames.has(leg.game)) continue;
    picked.push(leg);
    usedGames.add(leg.game);
    if (picked.length >= 4) break;
  }

  if (!picked.length) {
    parlayRoot.innerHTML = `
      <h2>🔥 Best Parlay of the Week</h2>
      <p style="font-size:0.88rem;">Edges too small to recommend a parlay right now.</p>
    `;
    return;
  }

  const probParlayMarket = picked.reduce(
    (acc, l) => acc * prob(l.price),
    1
  );
  const probParlayTrue = picked.reduce(
    (acc, l) => acc * l.trueProb,
    1
  );

  const marketOdds = probToAmerican(probParlayMarket);
  const fairOdds = probToAmerican(probParlayTrue);
  const edgePct = (probParlayTrue - probParlayMarket) * 100;

  parlayRoot.innerHTML = `
    <h2>🔥 Best Parlay of the Week</h2>
    <p style="font-size:0.88rem;margin-bottom:0.6rem;">
      Auto-built from the strongest moneyline edges on the board.
    </p>
    <ul style="font-size:0.9rem;margin-bottom:0.75rem;padding-left:1.1rem;">
      ${picked
        .map(
          l => `
        <li>
          <strong>${l.team}</strong> <span style="opacity:0.85;">(${l.game})</span>
          @ ${money(l.price)}
          — True win ${(l.trueProb * 100).toFixed(1)}%, Edge ${(l.edge * 100).toFixed(1)}%
        </li>
      `
        )
        .join("")}
    </ul>
    <div style="font-size:0.9rem;line-height:1.4;">
      <div><strong>Parlay Market Odds:</strong> ${money(marketOdds)}</div>
      <div><strong>Parlay Fair Odds:</strong> ${money(fairOdds)}</div>
      <div><strong>Overall Edge:</strong> ${edgePct.toFixed(1)}%</div>
    </div>
  `;
}

// ========================================================
//  STARTUP
// ========================================================
loadAll();

// ========================================================
//  EXPORT FOR DASHBOARD
// ========================================================
export { computeGameAnalytics };
