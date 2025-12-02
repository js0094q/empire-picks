// ========================================================
//  EMPIRE-PICKS POLISHED SCRIPT.JS
// ========================================================

// ---------- IMPORTS ----------
import { NFL_TEAMS } from "./teams.js";

// ---------- DOM Helpers ----------
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const money = o => (o > 0 ? `+${o}` : o);

// Convert American-style odds to win probability
function prob(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

// No-vig normalization: given two probabilities, scale to sum to 1
function noVig(p1, p2) {
  const t = p1 + p2;
  return t === 0 ? [0.5, 0.5] : [p1 / t, p2 / t];
}

const avg = arr => (arr.length ? arr.reduce((a,b)=>a+b, 0) / arr.length : 0);

// ========================================================
//  API WRAPPERS
// ========================================================
const api = {
  async events() {
    const r = await fetch("/api/events");
    if (!r.ok) throw new Error("Events fetch failed");
    return r.json();
  },
  async odds() {
    const r = await fetch("/api/odds");
    if (!r.ok) throw new Error("Odds fetch failed");
    return r.json();
  },
  async props(evId) {
    const r = await fetch(`/api/event-odds?eventId=${encodeURIComponent(evId)}`);
    if (!r.ok) throw new Error("Props fetch failed");
    return r.json();
  }
};

// Global pool to build “best parlay of the week”
let PARLAY_POOL = [];

// Root elements
const gamesEl = $("#games");
const refreshBtn = $("#refreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", loadAll);

// ========================================================
//  MAIN LOADER
// ========================================================
async function loadAll() {
  gamesEl.textContent = "Loading NFL week data…";
  PARLAY_POOL = [];

  try {
    const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
    const odds = Array.isArray(oddsWrap) ? oddsWrap : oddsWrap.data ?? [];

    const byId = Object.fromEntries(odds.map(g => [g.id, g]));

    const now = Date.now();
    const cutoffMs = 4 * 60 * 60 * 1000; // 4h after kickoff

    const valid = events.filter(ev => {
      const g = byId[ev.id];
      if (!g) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoffMs;
    });

    gamesEl.innerHTML = "";
    valid.forEach(ev => {
      const card = renderGame(ev, byId[ev.id]);
      gamesEl.appendChild(card);
    });

    renderBestParlay();

  } catch (err) {
    console.error("LOADALL ERROR:", err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

loadAll();

// ========================================================
//  RENDER SINGLE GAME CARD
// ========================================================
function renderGame(ev, odds) {
  const card = document.createElement("div");
  card.className = "card";

  const kickoff = new Date(ev.commence_time).toLocaleString();

  // Build header (logos + teams + kickoff)
  const header = document.createElement("div");
  header.className = "card-header";
  header.style.display = "flex";
  header.style.justifyContent = "space-between";
  header.style.alignItems = "center";
  header.style.padding = "12px";
  header.style.background = "#111";
  header.style.color = "#eee";

  const away = document.createElement("div");
  away.style.display = "flex";
  away.style.alignItems = "center";
  const awayLogo = document.createElement("img");
  awayLogo.src = NFL_TEAMS[ev.away_team]?.logo || "";
  awayLogo.style.height = "36px";
  awayLogo.style.opacity = "0.9";
  away.appendChild(awayLogo);
  const awayName = document.createElement("span");
  awayName.textContent = ev.away_team;
  awayName.style.marginLeft = "8px";
  awayName.style.fontWeight = "500";
  away.appendChild(awayName);

  const center = document.createElement("div");
  center.style.textAlign = "center";
  center.style.fontSize = "0.9rem";
  center.style.color = "#ccc";
  center.textContent = kickoff;

  const home = document.createElement("div");
  home.style.display = "flex";
  home.style.alignItems = "center";
  const homeName = document.createElement("span");
  homeName.textContent = ev.home_team;
  homeName.style.marginRight = "8px";
  homeName.style.fontWeight = "500";
  const homeLogo = document.createElement("img");
  homeLogo.src = NFL_TEAMS[ev.home_team]?.logo || "";
  homeLogo.style.height = "36px";
  homeLogo.style.opacity = "0.9";
  home.appendChild(homeName);
  home.appendChild(homeLogo);

  header.appendChild(away);
  header.appendChild(center);
  header.appendChild(home);

  // Build body
  const body = document.createElement("div");
  body.className = "card-body";
  body.style.padding = "12px";
  body.style.background = "rgba(13,18,40,0.96)";

  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  body.appendChild(createAnalyticsBlock(analytics));

  const linesBlock = document.createElement("div");
  linesBlock.className = "lines-block";
  linesBlock.style.marginTop = "12px";
  body.appendChild(linesBlock);
  renderLines(linesBlock, odds, analytics, ev.id);

  const propsBlock = document.createElement("div");
  propsBlock.className = "props-block";
  propsBlock.style.marginTop = "16px";
  const loadPropsBtn = document.createElement("button");
  loadPropsBtn.textContent = "Load Player Props";
  loadPropsBtn.addEventListener("click", () => loadProps(ev.id, propsBlock));
  propsBlock.appendChild(loadPropsBtn);
  body.appendChild(propsBlock);

  card.appendChild(header);
  card.appendChild(body);

  return card;
}

// ========================================================
//  COMPUTE GAME ANALYTICS: Win %, projection, consensus line
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
        if (h && typeof h.point === "number") homeSpreads.push(h.point);
      }
      if (m.key === "totals") {
        const ov = m.outcomes.find(o => o.name.toLowerCase() === "over");
        if (ov && typeof ov.point === "number") totals.push(ov.point);
      }
    });
  });

  const pa = avg(mlAway), ph = avg(mlHome);
  const [nvA, nvH] = noVig(pa, ph);

  const winner = nvA > nvH ? away : home;
  const winnerProb = Math.max(nvA, nvH);

  const consensusSpread = homeSpreads.length ? avg(homeSpreads) : null;
  const consensusTotal = totals.length ? avg(totals) : null;

  let projHome = null, projAway = null;
  if (consensusSpread != null && consensusTotal != null) {
    const T = consensusTotal;
    const s = consensusSpread;
    const H = (T - s) / 2;
    const A = (T + s) / 2;
    projHome = H;
    projAway = A;
  }

  return {
    away,
    home,
    nvAway: nvA,
    nvHome: nvH,
    winner,
    winnerProb,
    consensusSpread,
    consensusTotal,
    projHome,
    projAway
  };
}

// ========================================================
//  BUILD ANALYTICS BLOCK (DOM element)
// ========================================================
function createAnalyticsBlock(a) {
  const box = document.createElement("div");
  box.style.padding = "8px";
  box.style.background = "rgba(0,0,0,0.2)";
  box.style.borderRadius = "8px";
  box.style.color = "#eee";

  const awayPct = (a.nvAway * 100).toFixed(1);
  const homePct = (a.nvHome * 100).toFixed(1);

  const html = `
    <div style="margin-bottom:6px; font-size:0.88rem;">
      <strong>Win Probability:</strong> ${a.winner} — ${(a.winnerProb*100).toFixed(1)}%
    </div>
    <div style="display:flex; flex-direction:column; gap:4px; margin-bottom:8px;">
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="width:60px;">${a.away}</span>
        <div style="flex:1; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden; height:6px;">
          <div style="width:${awayPct}%; height:100%; background:#ffcc33;"></div>
        </div>
        <span style="width:40px; text-align:right;">${awayPct}%</span>
      </div>
      <div style="display:flex; align-items:center; gap:6px;">
        <span style="width:60px;">${a.home}</span>
        <div style="flex:1; background:rgba(255,255,255,0.1); border-radius:4px; overflow:hidden; height:6px;">
          <div style="width:${homePct}%; height:100%; background:#ffcc33;"></div>
        </div>
        <span style="width:40px; text-align:right;">${homePct}%</span>
      </div>
    </div>
  `;

  box.innerHTML = html;

  if (a.projHome != null && a.projAway != null) {
    const p = document.createElement("div");
    p.style.fontSize = "0.84rem";
    p.style.color = "#ddd";
    p.style.marginTop = "4px";
    p.textContent = `Projected Score → ${a.away} ${a.projAway.toFixed(1)}, ${a.home} ${a.projHome.toFixed(1)}`;
    box.appendChild(p);
  }

  return box;
}

// ========================================================
//  LINES TABLE + PARLAY BUTTONS (ML, Spread, Total)
// ========================================================
function renderLines(container, game, analytics, gameId) {
  const rows = [];

  (game.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      mlAway: null,
      mlHome: null,
      spread: null,
      spreadPrice: null,
      total: null,
      totalPrice: null
    };

    const mk = bm.markets || [];

    const h2h = mk.find(m => m.key === "h2h");
    if (h2h) {
      const a = h2h.outcomes.find(o => o.name === analytics.away);
      const h = h2h.outcomes.find(o => o.name === analytics.home);
      if (a && h) {
        rec.mlAway = a.price;
        rec.mlHome = h.price;
      }
    }

    const sp = mk.find(m => m.key === "spreads");
    if (sp && sp.outcomes.length) {
      const s = sp.outcomes[0];
      rec.spread = s.point;
      rec.spreadPrice = s.price;
    }

    const tot = mk.find(m => m.key === "totals");
    if (tot && tot.outcomes.length) {
      const o = tot.outcomes.find(x => x.name.toLowerCase()==="over") || tot.outcomes[0];
      rec.total = o.point;
      rec.totalPrice = o.price;
    }

    rows.push(rec);
  });

  const tbl = document.createElement("table");
  tbl.className = "lines-table";
  tbl.style.width = "100%";

  const thead = document.createElement("thead");
  thead.innerHTML = `
    <tr>
      <th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th><th>Parlay</th>
    </tr>`;
  tbl.appendChild(thead);

  const tbody = document.createElement("tbody");

  rows.forEach(r => {
    const tr = document.createElement("tr");

    const tdBook = document.createElement("td");
    tdBook.textContent = r.book;
    tdBook.style.padding = "6px";

    const tdML = document.createElement("td");
    tdML.style.padding = "6px";
    if (r.mlAway != null && r.mlHome != null) {
      tdML.textContent = `${money(r.mlAway)} / ${money(r.mlHome)}`;
      const btnA = document.createElement("button");
      btnA.className = "add-leg";
      btnA.textContent = `➕ ${analytics.away}`;
      btnA.dataset.market = "ML";
      btnA.dataset.team = analytics.away;
      btnA.dataset.price = r.mlAway;
      btnA.dataset.trueprob = analytics.nvAway;
      btnA.dataset.game = `${analytics.away} @ ${analytics.home}`;
      tdML.appendChild(document.createElement("br"));
      tdML.appendChild(btnA);

      const btnH = document.createElement("button");
      btnH.className = "add-leg";
      btnH.textContent = `➕ ${analytics.home}`;
      btnH.dataset.market = "ML";
      btnH.dataset.team = analytics.home;
      btnH.dataset.price = r.mlHome;
      btnH.dataset.trueprob = analytics.nvHome;
      btnH.dataset.game = `${analytics.away} @ ${analytics.home}`;
      tdML.appendChild(btnH);
    } else {
      tdML.textContent = "–";
    }

    const tdS = document.createElement("td");
    tdS.style.padding = "6px";
    if (r.spread != null) {
      tdS.textContent = `${r.spread} (${money(r.spreadPrice)})`;
      const btnS = document.createElement("button");
      btnS.className = "add-leg";
      btnS.textContent = "➕ Spread";
      btnS.dataset.market = "SPREAD";
      btnS.dataset.price = r.spreadPrice;
      btnS.dataset.trueprob = analytics.nvHome; // approximate
      btnS.dataset.side = r.spread;
      btnS.dataset.game = `${analytics.away} @ ${analytics.home}`;
      tdS.appendChild(document.createElement("br"));
      tdS.appendChild(btnS);
    } else {
      tdS.textContent = "–";
    }

    const tdT = document.createElement("td");
    tdT.style.padding = "6px";
    if (r.total != null) {
      tdT.textContent = r.total;
      const btnT = document.createElement("button");
      btnT.className = "add-leg";
      btnT.textContent = "➕ Total";
      btnT.dataset.market = "TOTAL";
      btnT.dataset.price = r.totalPrice;
      btnT.dataset.trueprob = (analytics.nvAway + analytics.nvHome)/2; // naive
      btnT.dataset.side = r.total;
      btnT.dataset.game = `${analytics.away} @ ${analytics.home}`;
      tdT.appendChild(document.createElement("br"));
      tdT.appendChild(btnT);
    } else {
      tdT.textContent = "–";
    }

    const tdP = document.createElement("td");
    tdP.style.padding = "6px";
    tdP.textContent = ""; // nothing, parlay builder handles scrap

    tr.appendChild(tdBook);
    tr.appendChild(tdML);
    tr.appendChild(tdS);
    tr.appendChild(tdT);
    tr.appendChild(tdP);

    tbody.appendChild(tr);
  });

  tbl.appendChild(tbody);
  container.innerHTML = "";
  container.appendChild(tbl);
}

// ========================================================
//  LOAD PLAYER PROPS, with parlay buttons
// ========================================================
async function loadProps(evId, container) {
  container.innerHTML = "Loading props…";
  try {
    const wrap = await api.props(evId);
    const propsWrap = wrap.props ?? wrap;
    const bms = propsWrap.bookmakers || [];

    if (!bms.length) {
      container.textContent = "No props available.";
      return;
    }

    const out = document.createElement("div");
    out.style.color = "#eee";

    bms.forEach(bm => {
      (bm.markets || []).forEach(m => {
        const tbl = document.createElement("table");
        tbl.style.width = "100%";
        tbl.style.marginTop = "8px";

        const thead = document.createElement("thead");
        thead.innerHTML = `
          <tr>
            <th>Book</th><th>Player</th><th>Pick</th><th>Line</th><th>Price</th><th>Parlay</th>
          </tr>`;
        tbl.appendChild(thead);

        const tbody = document.createElement("tbody");

        m.outcomes.forEach(o => {
          const tr = document.createElement("tr");
          const tdBook = document.createElement("td");
          tdBook.textContent = bm.title;
          tdBook.style.padding = "4px";

          const tdPlayer = document.createElement("td");
          tdPlayer.textContent = o.description || o.name || "–";
          tdPlayer.style.padding = "4px";

          const tdPick = document.createElement("td");
          tdPick.textContent = o.name;
          tdPick.style.padding = "4px";

          const tdLine = document.createElement("td");
          tdLine.textContent = o.point != null ? o.point : "–";
          tdLine.style.padding = "4px";

          const tdPrice = document.createElement("td");
          tdPrice.textContent = money(o.price);
          tdPrice.style.padding = "4px";

          const tdParlay = document.createElement("td");
          tdParlay.style.padding = "4px";
          const btn = document.createElement("button");
          btn.className = "add-leg";
          btn.textContent = "➕ Add";
          btn.dataset.market = "PROP";
          btn.dataset.player = o.description || o.name;
          btn.dataset.type = m.key;
          btn.dataset.side = o.name;
          btn.dataset.point = o.point ?? "";
          btn.dataset.price = o.price;
          btn.dataset.trueprob = prob(o.price);
          btn.dataset.game = `${propsWrap.away_team} @ ${propsWrap.home_team}`;
          tdParlay.appendChild(btn);

          tr.appendChild(tdBook);
          tr.appendChild(tdPlayer);
          tr.appendChild(tdPick);
          tr.appendChild(tdLine);
          tr.appendChild(tdPrice);
          tr.appendChild(tdParlay);
          tbody.appendChild(tr);
        });

        tbl.appendChild(tbody);
        out.appendChild(tbl);
      });
    });

    container.innerHTML = "";
    container.appendChild(out);

  } catch (err) {
    console.error("PROPS ERROR:", err);
    container.textContent = "Failed to load props.";
  }
}

// ========================================================
//  BEST PARLAY OF THE WEEK GENERATOR
// ========================================================
function renderBestParlay() {
  const slot = $("#bestParlay");
  if (!slot) return;

  if (!PARLAY_POOL.length) {
    slot.innerHTML = `
      <h2 style="color:#ffcc33;">🔥 Best Parlay of the Week</h2>
      <p style="color:#ccc;">No +EV moneyline legs found yet. Refresh after lines settle.</p>
    `;
    return;
  }

  const sorted = PARLAY_POOL.slice().sort((a, b) => b.edge - a.edge);
  const picks = [];
  const usedGames = new Set();

  for (const leg of sorted) {
    if (usedGames.has(leg.game)) continue;
    picks.push(leg);
    usedGames.add(leg.game);
    if (picks.length >= 4) break;
  }

  if (!picks.length) {
    slot.innerHTML = `
      <h2 style="color:#ffcc33;">🔥 Best Parlay of the Week</h2>
      <p style="color:#ccc;">No suitable parlay found at this time.</p>
    `;
    return;
  }

  const probMarket = picks.reduce((acc, l) => acc * prob(l.price), 1);
  const probFair   = picks.reduce((acc, l) => acc * l.trueProb, 1);

  const toAmerican = p => {
    if (!p || p <= 0) return null;
    return p > 0.5
      ? -Math.round((p / (1 - p)) * 100)
      : Math.round(((1 - p) / p) * 100);
  };

  const marketOdds = toAmerican(probMarket);
  const fairOdds   = toAmerican(probFair);
  const edgePct    = (probFair - probMarket) * 100;

  let html = `<h2 style="color:#ffcc33;">🔥 Best Parlay of the Week</h2>`;
  html += `<ul style="color:#eee; margin-left:1rem;">`;
  picks.forEach(l => {
    html += `<li>${l.team} (${l.game}) @ ${money(l.price)} — Edge: ${(l.edge*100).toFixed(1)}%</li>`;
  });
  html += `</ul>`;
  html += `<div style="color:#ccc; font-size:0.9rem;">
    Market Odds: ${money(marketOdds)}<br>
    Fair Odds:   ${money(fairOdds)}<br>
    Expected Edge: ${edgePct.toFixed(1)}%
  </div>`;

  slot.innerHTML = html;
}
