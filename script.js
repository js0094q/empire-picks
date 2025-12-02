// ========================================================
// EmpirePicks — Final script.js (Option B styling, parlay fixed)
// ========================================================

import { NFL_TEAMS } from "./teams.js";

// DOM Helpers
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = o => (o > 0 ? `+${o}` : o);

// Odds ↔ probability converters
function prob(odds) {
  odds = Number(odds);
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function americanToDecimal(odds) {
  odds = Number(odds);
  return odds > 0 ? 1 + odds / 100 : 1 + 100 / Math.abs(odds);
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function noVig(p1, p2) {
  const t = p1 + p2;
  return t === 0 ? [0.5, 0.5] : [p1 / t, p2 / t];
}

// API wrappers
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

// Parlay state
let PARLAY_POOL = [];

// Root elements
const gamesEl = $("#games");
const refreshBtn = $("#refreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", loadAll);

// Main loader
async function loadAll() {
  gamesEl.textContent = "Loading NFL week data…";
  PARLAY_POOL = [];

  try {
    const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
    const odds = Array.isArray(oddsWrap) ? oddsWrap : oddsWrap.data ?? [];

    const byId = Object.fromEntries(odds.map(g => [g.id, g]));

    const now = Date.now();
    const cutoffMs = 4 * 60 * 60 * 1000;

    const valid = events.filter(ev => {
      const g = byId[ev.id];
      if (!g) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoffMs;
    });

    gamesEl.innerHTML = "";
    valid.forEach(ev => {
      const card = renderGame(ev, byId[ev.id]);
      gamesEl.append(card);
    });

    renderBestParlay();
  } catch (err) {
    console.error("LOADALL ERROR:", err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

loadAll();

// --- Render single game card ---
function renderGame(ev, odds) {
  const card = document.createElement("div");
  card.className = "card";

  const kickoff = new Date(ev.commence_time).toLocaleString();

  // Header (team colors / logos)
  const header = document.createElement("div");
  header.className = "card-header";

  const away = document.createElement("div");
  away.style.display = "flex";
  away.style.alignItems = "center";
  const awayLogo = document.createElement("img");
  awayLogo.src = NFL_TEAMS[ev.away_team]?.logo || "";
  awayLogo.style.height = "36px";
  awayLogo.style.opacity = "0.9";
  const awayName = document.createElement("span");
  awayName.textContent = ev.away_team;
  awayName.style.marginLeft = "8px";
  away.append(awayLogo, awayName);

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
  const homeLogo = document.createElement("img");
  homeLogo.src = NFL_TEAMS[ev.home_team]?.logo || "";
  homeLogo.style.height = "36px";
  homeLogo.style.opacity = "0.9";
  home.append(homeName, homeLogo);

  header.append(away, center, home);
  card.append(header);

  const body = document.createElement("div");
  body.className = "card-body";

  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  body.append(createAnalyticsBlock(analytics));

  const linesBlock = document.createElement("div");
  linesBlock.className = "lines-block";
  body.append(linesBlock);
  renderLines(linesBlock, odds, analytics);

  const propsBlock = document.createElement("div");
  propsBlock.style.marginTop = "16px";
  const loadPropsBtn = document.createElement("button");
  loadPropsBtn.textContent = "Load Player Props";
  loadPropsBtn.addEventListener("click", () => loadProps(ev.id, propsBlock));
  propsBlock.append(loadPropsBtn);
  body.append(propsBlock);

  card.append(body);

  // Apply team header colors (home team)
  const homeTeamObj = NFL_TEAMS[ev.home_team];
  if (homeTeamObj) {
    card.style.setProperty("--team-primary", homeTeamObj.primary);
    card.style.setProperty("--team-secondary", homeTeamObj.secondary);
  }

  return card;
}

// --- Compute analytics ---
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
        const ov = m.outcomes.find(o => o.name.toLowerCase()==="over");
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
    const T = consensusTotal, s = consensusSpread;
    projHome = (T - s) / 2;
    projAway = (T + s) / 2;
  }

  return {
    away, home,
    nvAway: nvA, nvHome: nvH,
    winner, winnerProb,
    consensusSpread, consensusTotal,
    projHome, projAway
  };
}

// --- Analytics block (simple, no bars) ---
function createAnalyticsBlock(a) {
  const box = document.createElement("div");
  box.className = "analytics-block";
  box.style.color = "#eee";

  let html = `
    <div style="margin-bottom:6px;">
      <strong>Win Probability:</strong> ${a.winner} — ${(a.winnerProb * 100).toFixed(1)}%
    </div>
  `;
  if (a.projHome != null && a.projAway != null) {
    html += `
      <div style="font-size:0.89rem; color:#ccc;">
        Projected Score → ${a.away} ${a.projAway.toFixed(1)}, ${a.home} ${a.projHome.toFixed(1)}
      </div>
    `;
  }
  box.innerHTML = html;
  return box;
}

// --- Render lines + parlay buttons ---
function renderLines(container, game, analytics) {
  const rows = [];

  (game.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      mlAway: null, mlHome: null,
      spread: null, spreadPrice: null,
      total: null, totalPrice: null
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

  const thead = document.createElement("thead");
  thead.innerHTML = `<tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th><th>Parlay</th></tr>`;
  tbl.append(thead);

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

      const btnAway = document.createElement("button");
      btnAway.className = "add-leg";
      btnAway.textContent = `➕ ${analytics.away}`;
      btnAway.dataset.market = "ML";
      btnAway.dataset.team = analytics.away;
      btnAway.dataset.price = r.mlAway;
      btnAway.dataset.trueprob = analytics.nvAway;
      btnAway.dataset.game = `${analytics.away} @ ${analytics.home}`;
      btnAway.dataset.edge = analytics.nvAway - prob(r.mlAway);

      const btnHome = document.createElement("button");
      btnHome.className = "add-leg";
      btnHome.textContent = `➕ ${analytics.home}`;
      btnHome.dataset.market = "ML";
      btnHome.dataset.team = analytics.home;
      btnHome.dataset.price = r.mlHome;
      btnHome.dataset.trueprob = analytics.nvHome;
      btnHome.dataset.game = `${analytics.away} @ ${analytics.home}`;
      btnHome.dataset.edge = analytics.nvHome - prob(r.mlHome);

      tdML.append(document.createElement("br"), btnAway, btnHome);
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
      btnS.dataset.trueprob = analytics.nvHome;
      btnS.dataset.game = `${analytics.away} @ ${analytics.home}`;
      btnS.dataset.side = r.spread;
      tdS.append(document.createElement("br"), btnS);
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
      btnT.dataset.trueprob = (analytics.nvAway + analytics.nvHome) / 2;
      btnT.dataset.game = `${analytics.away} @ ${analytics.home}`;
      btnT.dataset.side = r.total;
      tdT.append(document.createElement("br"), btnT);
    } else {
      tdT.textContent = "–";
    }

    const tdP = document.createElement("td");
    tdP.style.padding = "6px";
    tdP.textContent = "";

    tr.append(tdBook, tdML, tdS, tdT, tdP);
    tbody.append(tr);
  });

  tbl.append(tbody);
  container.innerHTML = "";
  container.append(tbl);
}

// --- Load player props & add-leg for props ---
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
        thead.innerHTML = `<tr><th>Book</th><th>Player</th><th>Pick</th><th>Line</th><th>Price</th><th>Parlay</th></tr>`;
        tbl.append(thead);

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
          btn.dataset.player = o.description || o.name || "";
          btn.dataset.type   = m.key;
          btn.dataset.side   = o.name;
          btn.dataset.point  = o.point ?? "";
          btn.dataset.price  = o.price;
          btn.dataset.trueprob = prob(o.price);
          btn.dataset.game   = `${propsWrap.away_team} @ ${propsWrap.home_team}`;
          btn.dataset.edge   = 0;
          tdParlay.append(btn);

          tr.append(tdBook, tdPlayer, tdPick, tdLine, tdPrice, tdParlay);
          tbody.append(tr);
        });
        tbl.append(tbody);
        out.append(tbl);
      });
    });

    container.innerHTML = "";
    container.append(out);
  } catch (err) {
    console.error("PROPS ERROR:", err);
    container.textContent = "Failed to load props.";
  }
}

// --- Best Parlay of the Week generator ---
function renderBestParlay() {
  const slot = $("#bestParlay");
  if (!slot) return;

  if (!PARLAY_POOL.length) {
    slot.innerHTML = `
      <h2>🔥 Best Parlay of the Week</h2>
      <p style="color:#ccc;">No +EV legs detected yet.</p>
    `;
    return;
  }

  const sorted = PARLAY_POOL
    .filter(l => !isNaN(l.edge))
    .sort((a, b) => b.edge - a.edge);

  const picks = [];
  const usedGames = new Set();

  for (const l of sorted) {
    if (usedGames.has(l.game)) continue;
    picks.push(l);
    usedGames.add(l.game);
    if (picks.length >= 3) break;
  }

  if (!picks.length) {
    slot.innerHTML = `
      <h2>🔥 Best Parlay of the Week</h2>
      <p style="color:#ccc;">No valid legs available.</p>
    `;
    return;
  }

  let dec = 1;
  picks.forEach(l => dec *= americanToDecimal(l.price));

  const marketOdds = dec >= 2
    ? "+" + Math.round((dec - 1) * 100)
    : "-" + Math.round(100 / (dec - 1));

  let html = `<h2>🔥 Best Parlay of the Week</h2><ul>`;
  picks.forEach(p => {
    html += `<li>${p.team || p.player} (${p.game}) @ ${money(p.price)} — edge ${(p.edge*100).toFixed(1)}%</li>`;
  });
  html += `</ul>
    <div style="color:#ccc; font-size:0.9rem;">
      Parlay Odds: ${marketOdds}
    </div>
  `;

  slot.innerHTML = html;
}

// --- Add-leg event listener ---
document.addEventListener("click", e => {
  if (!e.target.matches("button.add-leg")) return;
  const b = e.target;
  const leg = {
    market: b.dataset.market,
    price: Number(b.dataset.price),
    game: b.dataset.game,
    team: b.dataset.team || null,
    player: b.dataset.player || null,
    type: b.dataset.type || null,
    side: b.dataset.side || null,
    point: b.dataset.point || null,
    trueProb: Number(b.dataset.trueprob),
    edge: Number(b.dataset.edge || 0)
  };
  PARLAY_POOL.push(leg);
  renderBestParlay();
});
