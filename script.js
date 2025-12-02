// ================================================
// EmpirePicks — script.js (Option A2 styling + hybrid odds + parlay + analytics)
// ================================================

import { NFL_TEAMS } from "./teams.js";

// --- DOM Helpers ---
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const money = o => (o > 0 ? `+${o}` : String(o));

// --- Odds ↔ probability converters ---
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

// --- Global Parlay state ---
let PARLAY_POOL = [];

// --- DOM roots ---
const gamesEl = $("#games");
const refreshBtn = $("#refreshBtn");
if (refreshBtn) refreshBtn.addEventListener("click", loadAll);

// --- Main loader ---
async function loadAll() {
  if (!gamesEl) return;
  gamesEl.textContent = "Loading NFL week data…";
  PARLAY_POOL = [];

  try {
    const [eventsRes, oddsRes] = await Promise.all([
      fetch("/api/events"),
      fetch("/api/odds")
    ]);
    if (!eventsRes.ok) throw new Error("Failed to fetch events");
    if (!oddsRes.ok) throw new Error("Failed to fetch odds");

    const events = await eventsRes.json();
    const oddsWrap = await oddsRes.json();
    const oddsList = Array.isArray(oddsWrap) ? oddsWrap : (oddsWrap.data ?? []);

    const byId = Object.fromEntries(oddsList.map(g => [g.id, g]));

    const now = Date.now();
    const cutoffMs = 4 * 60 * 60 * 1000; // 4h past kickoff

    const validGames = events.filter(ev => {
      const g = byId[ev.id];
      if (!g) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoffMs;
    });

    gamesEl.innerHTML = "";
    validGames.forEach(ev => {
      const card = renderGame(ev, byId[ev.id]);
      gamesEl.append(card);
    });

    renderBestParlay();
  } catch (err) {
    console.error("LOAD ERROR:", err);
    gamesEl.textContent = "Failed to load NFL data. Try refreshing.";
  }
}

loadAll();

// --- Render a single game card ---
function renderGame(ev, odds) {
  const card = document.createElement("div");
  card.className = "card card-dark";

  const kickoff = new Date(ev.commence_time).toLocaleString();

  // Header: Teams + logos
  const header = document.createElement("div");
  header.className = "card-header";

  const away = document.createElement("div");
  away.className = "team away";
  const awayLogo = document.createElement("img");
  awayLogo.src = NFL_TEAMS[ev.away_team]?.logo || "";
  awayLogo.alt = ev.away_team;
  away.append(awayLogo, document.createElement("span")).lastChild.textContent = ev.away_team;

  const home = document.createElement("div");
  home.className = "team home";
  const homeLogo = document.createElement("img");
  homeLogo.src = NFL_TEAMS[ev.home_team]?.logo || "";
  homeLogo.alt = ev.home_team;
  home.append(document.createElement("span")).firstChild.textContent = ev.home_team;
  home.append(homeLogo);

  const center = document.createElement("div");
  center.className = "kickoff";
  center.textContent = kickoff;

  header.append(away, center, home);
  card.append(header);

  // Body
  const body = document.createElement("div");
  body.className = "card-body";

  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  body.append(createAnalyticsBlock(analytics));

  const linesContainer = document.createElement("div");
  linesContainer.className = "lines-container";
  body.append(linesContainer);
  renderLines(linesContainer, odds, analytics);

  const propsContainer = document.createElement("div");
  propsContainer.className = "props-container";
  const loadPropsBtn = document.createElement("button");
  loadPropsBtn.className = "btn btn-props";
  loadPropsBtn.textContent = "Load Player Props";
  loadPropsBtn.addEventListener("click", () => loadProps(ev.id, propsContainer));
  propsContainer.append(loadPropsBtn);
  body.append(propsContainer);

  card.append(body);

  // Apply team colors (home team as gradient)
  const ht = NFL_TEAMS[ev.home_team];
  if (ht) {
    card.style.background = `linear-gradient(135deg, ${ht.primary} 0%, ${ht.secondary} 60%)`;
    card.style.borderColor = ht.secondary;
  }

  return card;
}

// --- Compute analytics (win %, consensus spread/total, projected scores) ---
function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers || [];
  const mlAway = [], mlHome = [], spreads = [], totals = [];

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
        m.outcomes.forEach(o => {
          if (typeof o.point === "number") spreads.push(o.point);
        });
      }
      if (m.key === "totals") {
        m.outcomes.forEach(o => {
          if (typeof o.point === "number") totals.push(o.point);
        });
      }
    });
  });

  const pA = avg(mlAway), pH = avg(mlHome);
  const [nvA, nvH] = noVig(pA, pH);
  const winner  = nvA > nvH ? away : home;
  const winnerProb = Math.max(nvA, nvH);

  const consensusSpread = spreads.length ? avg(spreads) : null;
  const consensusTotal  = totals.length  ? avg(totals ) : null;

  let projHome = null, projAway = null;
  if (consensusSpread != null && consensusTotal != null) {
    const s = consensusSpread, T = consensusTotal;
    projHome = (T - s) / 2;
    projAway = (T + s) / 2;
  }

  return { away, home, nvAway: nvA, nvHome: nvH,
           winner, winnerProb,
           consensusSpread, consensusTotal,
           projHome, projAway };
}

// --- Build analytics HTML block ---
function createAnalyticsBlock(a) {
  const box = document.createElement("div");
  box.className = "analytics";
  let html = `<div class="win-prob"><strong>Win Prog:</strong> ${a.winner} — ${(a.winnerProb*100).toFixed(1)}%</div>`;
  if (a.projHome != null && a.projAway != null) {
    html += `<div class="proj-score" style="color:#ccc;">
      Projected Score → ${a.away} ${(a.projAway).toFixed(1)}, ${a.home} ${(a.projHome).toFixed(1)}
    </div>`;
  }
  if (a.consensusSpread != null) {
    html += `<div class="consensus-spread">
      Spread (home): ≈ ${a.consensusSpread.toFixed(1)}
    </div>`;
  }
  if (a.consensusTotal != null) {
    html += `<div class="consensus-total" style="color:#ccc;">
      Total (O/U): ≈ ${a.consensusTotal.toFixed(1)}
    </div>`;
  }
  box.innerHTML = html;
  return box;
}

// --- Render lines + parlay buttons ---
function renderLines(container, game, analytics) {
  const rows = [];

  (game.bookmakers || []).forEach(bm => {
    const rec = { book: bm.title };
    bm.markets.forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === analytics.away);
        const h = m.outcomes.find(o => o.name === analytics.home);
        if (a && h) {
          rec.mlAway = a.price;
          rec.mlHome = h.price;
        }
      }
      if (m.key === "spreads") {
        const s = m.outcomes[0];
        rec.spread = s.point;
        rec.spreadPrice = s.price;
      }
      if (m.key === "totals") {
        const o = m.outcomes.find(o2 => o2.name.toLowerCase()==="over") || m.outcomes[0];
        rec.total = o.point;
        rec.totalPrice = o.price;
      }
    });
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
    // Book
    const tdBook = document.createElement("td");
    tdBook.textContent = r.book;
    // ML
    const tdML = document.createElement("td");
    if (r.mlAway != null && r.mlHome != null) {
      tdML.textContent = `${money(r.mlAway)} / ${money(r.mlHome)}`;
      const btnA = document.createElement("button");
      btnA.className = "btn btn-leg";
      btnA.textContent = `➕ ${analytics.away}`;
      btnA.dataset.parlay = "1";
      btnA.dataset.market = "ML";
      btnA.dataset.team   = analytics.away;
      btnA.dataset.price  = r.mlAway;
      btnA.dataset.trueprob = analytics.nvAway;
      btnA.dataset.game   = `${analytics.away} @ ${analytics.home}`;
      btnA.dataset.edge   = analytics.nvAway - prob(r.mlAway);
      const btnH = document.createElement("button");
      btnH.className = "btn btn-leg";
      btnH.textContent = `➕ ${analytics.home}`;
      btnH.dataset.parlay = "1";
      btnH.dataset.market = "ML";
      btnH.dataset.team   = analytics.home;
      btnH.dataset.price  = r.mlHome;
      btnH.dataset.trueprob = analytics.nvHome;
      btnH.dataset.game   = `${analytics.away} @ ${analytics.home}`;
      btnH.dataset.edge   = analytics.nvHome - prob(r.mlHome);
      tdML.append(document.createElement("br"), btnA, btnH);
    } else tdML.textContent = "–";

    // Spread
    const tdS = document.createElement("td");
    if (r.spread != null) {
      tdS.textContent = `${r.spread} (${money(r.spreadPrice)})`;
      const btnS = document.createElement("button");
      btnS.className = "btn btn-leg";
      btnS.textContent = `➕ Spread`;
      btnS.dataset.parlay = "1";
      btnS.dataset.market = "SPREAD";
      btnS.dataset.price  = r.spreadPrice;
      btnS.dataset.trueprob = analytics.nvHome;
      btnS.dataset.game = `${analytics.away} @ ${analytics.home}`;
      btnS.dataset.side = r.spread;
      tdS.append(document.createElement("br"), btnS);
    } else tdS.textContent = "–";

    // Total
    const tdT = document.createElement("td");
    if (r.total != null) {
      tdT.textContent = r.total;
      const btnT = document.createElement("button");
      btnT.className = "btn btn-leg";
      btnT.textContent = `➕ O/U`;
      btnT.dataset.parlay = "1";
      btnT.dataset.market = "TOTAL";
      btnT.dataset.price = r.totalPrice;
      btnT.dataset.trueprob = (analytics.nvAway + analytics.nvHome) / 2;
      btnT.dataset.game = `${analytics.away} @ ${analytics.home}`;
      tdT.append(document.createElement("br"), btnT);
    } else tdT.textContent = "–";

    // Parlay placeholder
    const tdP = document.createElement("td");
    tdP.textContent = "";

    tr.append(tdBook, tdML, tdS, tdT, tdP);
    tbody.append(tr);
  });
  tbl.append(tbody);
  container.innerHTML = "";
  container.append(tbl);
}

// --- Load player props (if available) ---
async function loadProps(evId, container) {
  container.textContent = "Loading props…";
  try {
    const r = await fetch(`/api/event-odds?eventId=${encodeURIComponent(evId)}`);
    if (!r.ok) throw new Error("Props fetch failed");
    const wrap = await r.json();
    const bms = wrap.bookmakers || [];
    if (!bms.length) {
      container.textContent = "No props available.";
      return;
    }

    const out = document.createElement("div");
    out.className = "props-list";

    bms.forEach(bm => {
      (bm.markets || []).forEach(m => {
        const tbl = document.createElement("table");
        tbl.className = "props-table";
        const thead = document.createElement("thead");
        thead.innerHTML = `<tr><th>Book</th><th>Player</th><th>Pick</th><th>Line</th><th>Price</th><th>Parlay</th></tr>`;
        tbl.append(thead);

        const tbody = document.createElement("tbody");
        m.outcomes.forEach(o => {
          const tr = document.createElement("tr");
          ["title","description","name","point","price"].forEach((key,i) => {
            const td = document.createElement("td");
            td.textContent = key === "title" ? bm.title : (o[key] ?? o.name ?? "");
            td.style.padding = "4px";
            tr.append(td);
          });
          const tdParlay = document.createElement("td");
          const btn = document.createElement("button");
          btn.className = "btn btn-leg";
          btn.textContent = "➕ Add";
          btn.dataset.parlay = "1";
          btn.dataset.market = "PROP";
          btn.dataset.player = o.description || o.name;
          btn.dataset.type   = m.key;
          btn.dataset.side   = o.name;
          btn.dataset.point  = o.point ?? "";
          btn.dataset.price  = o.price;
          btn.dataset.trueprob = prob(o.price);
          btn.dataset.game   = `${wrap.away_team} @ ${wrap.home_team}`;
          btn.dataset.edge   = 0;
          tdParlay.append(btn);
          tr.append(tdParlay);
          tbody.append(tr);
        });
        tbl.append(tbody);
        out.append(tbl);
      });
    });

    container.innerHTML = "";
    container.append(out);
  } catch (err) {
    console.error("Props load error:", err);
    container.textContent = "Failed to load props.";
  }
}

// --- Best Parlay generator ---
function renderBestParlay() {
  const slot = $("#bestParlay");
  if (!slot) return;
  if (!PARLAY_POOL.length) {
    slot.innerHTML = `<h2>🔥 Best Parlay of the Week</h2><p style="color:#ccc;">No +EV legs detected yet.</p>`;
    return;
  }
  // pick top 3 unique-game legs by edge
  const sorted = PARLAY_POOL.filter(l => !isNaN(l.edge)).sort((a,b) => b.edge - a.edge);
  const picks = [];
  const seen = new Set();
  for (const l of sorted) {
    if (seen.has(l.game)) continue;
    picks.push(l);
    seen.add(l.game);
    if (picks.length >= 3) break;
  }
  if (!picks.length) {
    slot.innerHTML = `<h2>🔥 Best Parlay of the Week</h2><p style="color:#ccc;">No valid legs available.</p>`;
    return;
  }
  let dec = 1;
  picks.forEach(l => dec *= americanToDecimal(l.price));
  const marketOdds = dec >= 2 
    ? "+" + Math.round((dec - 1)*100) 
    : "-" + Math.round(100 / (dec - 1));

  let html = `<h2>🔥 Best Parlay of the Week</h2><ul>`;
  picks.forEach(p => {
    html += `<li>${p.team || p.player} (${p.game}) @ ${money(p.price)} — edge ${(p.edge*100).toFixed(1)}%</li>`;
  });
  html += `</ul><div style="color:#ccc;font-size:0.9rem;">Parlay Odds: <strong>${marketOdds}</strong></div>`;
  slot.innerHTML = html;
}

// --- Parlay click handler ---
document.addEventListener("click", e => {
  const btn = e.target.closest("button[data-parlay='1']");
  if (!btn) return;
  const leg = {
    market: btn.dataset.market,
    price: Number(btn.dataset.price),
    game: btn.dataset.game,
    team: btn.dataset.team || null,
    player: btn.dataset.player || null,
    side: btn.dataset.side || null,
    type: btn.dataset.type || null,
    point: btn.dataset.point || "",
    trueProb: Number(btn.dataset.trueprob || 0),
    edge: Number(btn.dataset.edge || 0),
  };
  PARLAY_POOL.push(leg);
  renderBestParlay();
});
