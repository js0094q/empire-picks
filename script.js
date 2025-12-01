import { NFL_TEAMS } from "./teams.js";
// ===== DOM helpers =====
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

// ===== Math helpers =====
const money = o => o > 0 ? `+${o}` : o;

// American odds → implied probability (with vig)
function prob(odds){
  return odds > 0
    ? 100 / (odds + 100)
    : -odds / (-odds + 100);
}

// Remove vig from a two-outcome market
function noVig(p1, p2){
  const total = p1 + p2;
  if(!total) return [0.5, 0.5];
  return [p1 / total, p2 / total];
}

const avg = arr => arr && arr.length ? arr.reduce((a,b)=>a+b,0) / arr.length : 0;

// Group outcomes by "name:point" key (used for spreads/totals/props)
function groupByPoint(outcomes){
  const map = {};
  outcomes.forEach(o => {
    const key = `${o.name}:${o.point}`;
    if(!map[key]) map[key] = [];
    map[key].push(prob(o.price));
  });
  return map;
}

// ===== API wrappers (proxy through Vercel serverless routes) =====
const api = {
  async events(){ return fetch("/api/events").then(r => r.json()); },
  async odds(){ return fetch("/api/odds").then(r => r.json()); },
  async props(id){ return fetch(`/api/event-odds?eventId=${id}`).then(r => r.json()); }
};

// ===== UI root =====
const gamesEl = $("#games");
$("#refreshBtn").addEventListener("click", loadAll);

// ===== Main load =====
async function loadAll(){
  gamesEl.textContent = "Loading NFL week data...";

  const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
  const odds = oddsWrap.data ?? oddsWrap;  // /api/odds returns { remaining, data }

  const oddsById = Object.fromEntries(odds.map(g => [g.id, g]));
  const now = Date.now();
  const cutoffMs = 4 * 60 * 60 * 1000; // hide games 4h after kickoff

  const weekGames = events.filter(ev => {
    const gameOdds = oddsById[ev.id];
    if(!gameOdds) return false;
    const t = new Date(ev.commence_time).getTime();
    if(now > t + cutoffMs) return false;
    return true;
  });

  gamesEl.innerHTML = "";
  if(!weekGames.length){
    gamesEl.textContent = "No NFL games in the current Thursday–Monday window.";
    return;
  }

  weekGames.forEach(ev => {
    const gameOdds = oddsById[ev.id];
    gamesEl.appendChild(renderGame(ev, gameOdds));
  });
}

// ===== Build a single game card =====
function renderGame(ev, odds){
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

  // ESPN-style analytics block
  const analytics = computeGameAnalytics(odds, ev.away_team, ev.home_team);
  const header = card.querySelector(".card-header");
  header.insertAdjacentHTML("beforeend", analyticsHTML(analytics));

  // Lines table with EV + Best Bet
  renderLines($("#lines", card), odds, analytics);

  // Tabs
  $$(".tab", card).forEach(tab => {
    tab.addEventListener("click", () => {
      $$(".tab", card).forEach(t => t.classList.remove("active"));
      $$(".tab-content", card).forEach(c => c.classList.remove("active"));

      tab.classList.add("active");
      const content = card.querySelector(`#${tab.dataset.tab}`);
      content.classList.add("active");

      if(tab.dataset.tab === "props" && !content.dataset.loaded){
        loadProps(ev.id, content);
      }
    });
  });

  return card;
}

// ===== Game analytics engine (ESPN-style) =====
function computeGameAnalytics(game, away, home){
  const books = game.bookmakers || [];

  const mlAwayList = [];
  const mlHomeList = [];
  const spreadOutcomes = [];
  const totalOutcomes = [];

  books.forEach(bm => {
    (bm.markets || []).forEach(m => {
      if(m.key === "h2h"){
        const a = m.outcomes.find(o => o.name === away);
        const h = m.outcomes.find(o => o.name === home);
        if(a && h){
          mlAwayList.push(prob(a.price));
          mlHomeList.push(prob(h.price));
        }
      }
      if(m.key === "spreads"){
        m.outcomes.forEach(o => spreadOutcomes.push(o));
      }
      if(m.key === "totals"){
        m.outcomes.forEach(o => totalOutcomes.push(o));
      }
    });
  });

  const avgAway = avg(mlAwayList);
  const avgHome = avg(mlHomeList);
  const [nvAway, nvHome] = noVig(avgAway, avgHome); // consensus no-vig probs

  const mlFavorite   = nvAway > nvHome ? away : home;
  const favoriteProb = nvAway > nvHome ? nvAway : nvHome;

  // Consensus spread
  const spreadGroups = groupByPoint(spreadOutcomes);
  let bestSpreadKey  = null;
  let bestSpreadProb = 0;

  Object.entries(spreadGroups).forEach(([k, arr]) => {
    const p = avg(arr);
    if(p > bestSpreadProb){
      bestSpreadProb = p;
      bestSpreadKey  = k;
    }
  });

  // Consensus total
  const totalGroups = groupByPoint(totalOutcomes);
  let bestTotalKey  = null;
  let bestTotalProb = 0;

  Object.entries(totalGroups).forEach(([k, arr]) => {
    const p = avg(arr);
    if(p > bestTotalProb){
      bestTotalProb = p;
      bestTotalKey  = k;
    }
  });

  return {
    away,
    home,
    mlFavorite,
    favoriteProb,
    nvAway,
    nvHome,
    bestSpreadKey,
    bestSpreadProb,
    bestTotalKey,
    bestTotalProb
  };
}

function analyticsHTML(a){
  const [spreadTeam, spreadLine] = a.bestSpreadKey ? a.bestSpreadKey.split(":") : ["", ""];
  const [totalSide,  totalLine]  = a.bestTotalKey  ? a.bestTotalKey.split(":")  : ["", ""];

  return `
    <div style="margin-top:8px;padding:8px;border-radius:8px;
      background:#10152e;border:1px solid #2a3360;">
      <div style="font-size:0.9rem;color:#ffcc33;font-weight:600;margin-bottom:4px;">
        📊 EmpirePicks Forecast
      </div>
      <div style="font-size:0.82rem;line-height:1.4;">
        <strong>Win Probability</strong><br>
        • ${a.mlFavorite} favored at ${(a.favoriteProb*100).toFixed(1)}%
          (Away ${(a.nvAway*100).toFixed(1)}%, Home ${(a.nvHome*100).toFixed(1)}%)<br><br>
        <strong>Consensus Spread</strong><br>
        • ${spreadTeam || "–"} ${spreadLine || ""} 
          ${a.bestSpreadProb ? "(" + (a.bestSpreadProb*100).toFixed(1) + "% line confidence)" : ""}<br><br>
        <strong>Consensus Total</strong><br>
        • ${totalSide || "–"} ${totalLine || ""} 
          ${a.bestTotalProb ? "(" + (a.bestTotalProb*100).toFixed(1) + "% side confidence)" : ""}
      </div>
    </div>
  `;
}

// ===== Game lines table with EV “Best Bet” badge =====
function renderLines(container, game, analytics){
  const rows = [];

  (game.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      moneyline: "–",
      spread: "–",
      total: "–",
      edge: null   // positive = bettor edge vs market
    };

    let rowEdge = null;

    (bm.markets || []).forEach(m => {
      if(m.key === "h2h"){
        const away = m.outcomes.find(o => o.name === analytics.away);
        const home = m.outcomes.find(o => o.name === analytics.home);
        if(away && home){
          rec.moneyline = `${money(away.price)} / ${money(home.price)}`;

          const pAwayBook = prob(away.price);
          const pHomeBook = prob(home.price);

          const edgeAway = analytics.nvAway - pAwayBook;
          const edgeHome = analytics.nvHome - pHomeBook;

          rowEdge = Math.max(edgeAway, edgeHome);
        }
      }

      if(m.key === "spreads"){
        // Pick spread closest to consensus line when available, otherwise smallest absolute point
        let best = null;
        if(analytics.bestSpreadKey){
          const [, line] = analytics.bestSpreadKey.split(":");
          const lineNum = Number(line);
          best = m.outcomes
            .slice()
            .sort((a,b)=>Math.abs(a.point-lineNum)-Math.abs(b.point-lineNum))[0];
        }
        if(!best){
          best = m.outcomes.slice().sort((a,b)=>Math.abs(a.point)-Math.abs(b.point))[0];
        }
        if(best){
          rec.spread = `${best.name} ${best.point} (${money(best.price)})`;
        }
      }

      if(m.key === "totals"){
        const over  = m.outcomes.find(o => o.name.toLowerCase() === "over");
        const under = m.outcomes.find(o => o.name.toLowerCase() === "under");
        if(over && under){
          rec.total = `O${over.point} / U${under.point}`;
        }
      }
    });

    rec.edge = rowEdge;
    rows.push(rec);
  });

  // Identify best EV row for ⭐ badge
  let bestIndex = -1;
  let bestEdge  = 0;
  rows.forEach((r, idx) => {
    if(typeof r.edge === "number" && r.edge > bestEdge + 0.003){
      bestEdge = r.edge;
      bestIndex = idx;
    }
  });

  const htmlRows = rows.map((r, idx) => {
    const evText = typeof r.edge === "number"
      ? `${r.edge >= 0 ? "+" : ""}${(r.edge*100).toFixed(1)}%`
      : "";

    const badge = idx === bestIndex && bestEdge > 0.01
      ? ` <span class="ev-pos" style="font-weight:600;">⭐ Best Bet</span>`
      : "";

    return `
      <tr>
        <td>${r.book}</td>
        <td>${r.moneyline}</td>
        <td>${r.spread}</td>
        <td>${r.total}</td>
        <td>${evText}${badge}</td>
      </tr>
    `;
  }).join("");

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Book</th>
          <th>Moneyline (Away / Home)</th>
          <th>Spread</th>
          <th>Total (O/U)</th>
          <th>EV vs Market</th>
        </tr>
      </thead>
      <tbody>${htmlRows}</tbody>
    </table>
  `;
}

// ===== Player props loader + simple consensus =====
async function loadProps(id, container){
  container.dataset.loaded = "1";
  container.textContent = "Loading props…";

  const wrap = await api.props(id);
  const propsRoot = wrap.props ?? wrap;

  if(!propsRoot || !propsRoot.bookmakers || !propsRoot.bookmakers.length){
    container.textContent = "No props available yet for this game.";
    return;
  }

  const groups = {};
  propsRoot.bookmakers.forEach(bm => {
    (bm.markets || []).forEach(m => {
      if(!groups[m.key]) groups[m.key] = [];
      m.outcomes.forEach(o => {
        groups[m.key].push({
          book: bm.title,
          player: o.description || "–",
          name: o.name,      // Over / Under / Yes / No
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
    if(!arr || !arr.length) return;

    const consensus = computePropConsensus(arr);

    html += `<h3 style="margin-top:0.8rem;">${label(key)}</h3>`;

    // ESPN-style prop forecast list (top 8)
    html += `<div style="font-size:0.85rem;margin-bottom:0.4rem;">`;
    consensus.slice(0,8).forEach(p => {
      html += `
        <div>
          ⭐ <strong>${p.player}</strong> ${p.favorite} ${p.point} 
          (${(p.bestProb*100).toFixed(1)}% consensus)
        </div>
      `;
    });
    html += `</div>`;

    // Raw book table
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
          ${arr.slice(0,60).map(r => `
            <tr>
              <td>${r.book}</td>
              <td>${r.player}</td>
              <td>${r.name}</td>
              <td>${r.point ?? "–"}</td>
              <td>${money(r.price)}</td>
              <td>${(r.p*100).toFixed(1)}%</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    `;
  });

  container.innerHTML = html || "<em>No supported props for this matchup.</em>";
}

// Build simple consensus for props so we can show “most likely” side
function computePropConsensus(arr){
  const bucket = {};
  arr.forEach(r => {
    const key = `${r.player}:${r.point}`;
    if(!bucket[key]) bucket[key] = { over: [], under: [] };
    const side = r.name.toLowerCase();
    if(side === "over")  bucket[key].over.push(r.p);
    if(side === "under") bucket[key].under.push(r.p);
  });

  const out = [];
  Object.entries(bucket).forEach(([key, v]) => {
    const [player, rawPoint] = key.split(":");
    const point = rawPoint === "undefined" ? "" : rawPoint;
    const avgOver  = avg(v.over);
    const avgUnder = avg(v.under);
    const [nvOver, nvUnder] = noVig(avgOver, avgUnder);
    const favorite = nvOver >= nvUnder ? "Over" : "Under";
    const bestProb = favorite === "Over" ? nvOver : nvUnder;
    out.push({ player, point, favorite, bestProb });
  });

  return out.sort((a,b) => b.bestProb - a.bestProb);
}

function label(k){
  return ({
    player_anytime_td: "Anytime TD Scorer",
    player_pass_tds:   "Pass TDs (O/U)",
    player_pass_yds:   "Pass Yards (O/U)",
    player_rush_yds:   "Rush Yards (O/U)",
    player_receptions: "Receptions (O/U)"
  })[k] || k;
}

// ===== Kickoff =====
loadAll();
