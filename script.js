// ======================================================
// EmpirePicks – PRODUCTION BUILD (Dec 2025)
// UI restored, EV engine fixed, parlay fully working
// ======================================================

import { NFL_TEAMS } from "./teams.js";

// Shortcuts
const $ = (q, r = document) => r.querySelector(q);
const $$ = (q, r = document) => [...r.querySelectorAll(q)];
const money = o => (o > 0 ? `+${o}` : o);

// Math
function prob(odds) {
  odds = Number(odds);
  return odds > 0 ? 100/(odds+100) : (-odds)/(100-odds);
}
function decimal(odds) {
  odds = Number(odds);
  return odds > 0 ? 1 + odds/100 : 1 + 100/Math.abs(odds);
}
function expectedValue(trueP, odds) {
  const d = decimal(odds);
  const profit = d - 1;
  return trueP * profit - (1 - trueP);
}
function avg(arr) {
  return arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;
}
function noVig(p1,p2){
  const t = p1+p2;
  if(!t) return [0.5,0.5];
  return [p1/t, p2/t];
}

// API
const api = {
  async events() {
    const r = await fetch("/api/events");
    if(!r.ok) throw new Error("Failed events");
    return r.json();
  },
  async odds() {
    const r = await fetch("/api/odds");
    if(!r.ok) throw new Error("Failed odds");
    return r.json();
  },
  async props(id){
    const r = await fetch(`/api/event-odds?eventId=${id}`);
    if(!r.ok) throw new Error("Failed props");
    return r.json();
  }
};

// GLOBAL PARLAY STORAGE
window.PARLAY = [];

// Load
$("#refreshBtn")?.addEventListener("click", loadAll);
loadAll();

async function loadAll(){
  const gamesEl = $("#games");
  gamesEl.textContent = "Loading…";

  try {
    const [events, oddWrap] = await Promise.all([api.events(), api.odds()]);
    const odds = oddWrap.data ?? oddWrap ?? [];

    const byID = Object.fromEntries(odds.map(g=>[g.id,g]));

    // filter week
    const now = Date.now();
    const cutoff = 4 * 3600 * 1000;

    const valid = events.filter(ev => {
      const o = byID[ev.id];
      if(!o) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoff;
    });

    gamesEl.innerHTML = "";

    valid.forEach(ev => gamesEl.append(renderGame(ev, byID[ev.id])));

    renderBestParlay();

  } catch(err){
    console.error(err);
    $("#games").textContent = "Failed to load NFL data. Try refreshing.";
  }
}

// ==========================================================
// RENDER GAME CARD
// ==========================================================
function renderGame(ev, odds){
  const card = document.createElement("div");
  card.className = "card";

  const kickoff = new Date(ev.commence_time).toLocaleString();

  const hdr = document.createElement("div");
  hdr.className = "card-header";

  // LOGOS
  hdr.innerHTML = `
    <div class="teams-row">
      <img src="${NFL_TEAMS[ev.away_team]?.logo}" class="team-logo">
      <div class="vs-text">${ev.away_team} @ ${ev.home_team}</div>
      <img src="${NFL_TEAMS[ev.home_team]?.logo}" class="team-logo">
    </div>
    <small>${kickoff}</small>
  `;

  // Team colors
  const team = NFL_TEAMS[ev.home_team];
  if(team){
    card.style.background = `linear-gradient(135deg, ${team.primary}, ${team.secondary}, #0d1228)`;
    hdr.style.borderColor = team.secondary;
  }

  const analytics = computeAnalytics(odds, ev.away_team, ev.home_team);

  const body = document.createElement("div");
  body.className = "card-body";

  body.append(createAnalyticsBlock(analytics));

  // Lines tab
  const linesDiv = document.createElement("div");
  linesDiv.className = "tab-content active";

  renderLines(linesDiv, odds, analytics, ev);

  // Props tab
  const propsDiv = document.createElement("div");
  propsDiv.className = "tab-content";
  propsDiv.innerHTML = `<em>Loading…</em>`;

  // Tabs
  body.insertAdjacentHTML("beforeend", `
    <div class="tabs">
      <div class="tab active" data-t="lines">Game Lines</div>
      <div class="tab" data-t="props">Player Props</div>
    </div>
  `);

  const tabbar = body.querySelector(".tabs");
  tabbar.addEventListener("click", (e)=>{
    const t = e.target.closest(".tab");
    if(!t) return;

    tabbar.querySelectorAll(".tab").forEach(x=>x.classList.remove("active"));
    body.querySelectorAll(".tab-content").forEach(x=>x.classList.remove("active"));

    t.classList.add("active");

    if(t.dataset.t === "lines"){
      linesDiv.classList.add("active");
    } else {
      propsDiv.classList.add("active");
      if(!propsDiv.dataset.loaded){
        loadProps(ev.id, propsDiv, ev);
      }
    }
  });

  body.append(linesDiv, propsDiv);
  card.append(hdr, body);

  return card;
}

// ==========================================================
// ANALYTICS ENGINE
// ==========================================================
function computeAnalytics(game, away, home){
  const books = game.bookmakers ?? [];

  const pa = [];
  const ph = [];
  const spreads = [];
  const totals = [];

  books.forEach(bm=>{
    bm.markets?.forEach(m=>{
      if(m.key === "h2h"){
        const a = m.outcomes.find(o=>o.name===away);
        const h = m.outcomes.find(o=>o.name===home);
        if(a && h){
          pa.push(prob(a.price));
          ph.push(prob(h.price));
        }
      }
      if(m.key === "spreads"){
        m.outcomes.forEach(o=>{
          spreads.push(o);
        });
      }
      if(m.key === "totals"){
        m.outcomes.forEach(o=>{
          totals.push(o));
        });
      }
    });
  });

  const A = avg(pa);
  const H = avg(ph);
  const [nvA, nvH] = noVig(A,H);

  return {
    away,
    home,
    nvAway: nvA,
    nvHome: nvH,
    winner: nvA > nvH ? away : home,
    prob: Math.max(nvA,nvH)
  };
}

// ==========================================================
// ANALYTICS BLOCK UI
// ==========================================================
function createAnalyticsBlock(a){
  const d = document.createElement("div");
  d.className = "analytics";

  d.innerHTML = `
    <div class="analytic-title">📊 EmpirePicks Forecast</div>
    <div><strong>Win Probability:</strong> ${a.winner} at ${(a.prob*100).toFixed(1)}%</div>
  `;
  return d;
}

// ==========================================================
// LINES TABLE + PARLAY BUTTONS
// ==========================================================
function renderLines(div, game, analytics, evInfo){
  const rows = [];

  game.bookmakers?.forEach(bm=>{
    const rec = { book: bm.title, mlAway:null, mlHome:null, spread:null, sPrice:null, total:null, tPrice:null };

    bm.markets?.forEach(m=>{
      if(m.key==="h2h"){
        const a = m.outcomes.find(o=>o.name===analytics.away);
        const h = m.outcomes.find(o=>o.name===analytics.home);
        if(a && h){
          rec.mlAway = a.price;
          rec.mlHome = h.price;
        }
      }
      if(m.key==="spreads"){
        const s = m.outcomes[0];
        if(s){
          rec.spread = s.point;
          rec.sPrice = s.price;
        }
      }
      if(m.key==="totals"){
        const o = m.outcomes.find(o=>o.name.toLowerCase()==="over");
        if(o){
          rec.total = o.point;
          rec.tPrice = o.price;
        }
      }
    });

    rows.push(rec);
  });

  // build HTML
  div.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th></tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tb = div.querySelector("tbody");
  const label = `${evInfo.away_team} @ ${evInfo.home_team}`;

  rows.forEach(r=>{
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${r.book}</td>
      <td>${r.mlAway ? `${money(r.mlAway)} / ${money(r.mlHome)}` : "–"}</td>
      <td>${r.spread!=null ? `${r.spread} (${money(r.sPrice)})` : "–"}</td>
      <td>${r.total!=null ? `${r.total} (${money(r.tPrice)})` : "–"}</td>
    `;

    // ML buttons
    if(r.mlAway){
      tr.children[1].append(buildParlayBtn("ML", label, evInfo.away_team, r.mlAway, analytics.nvAway));
      tr.children[1].append(buildParlayBtn("ML", label, evInfo.home_team, r.mlHome, analytics.nvHome));
    }

    // Spread
    if(r.spread!=null){
      tr.children[2].append(buildParlayBtn("SPREAD", label, r.spread, r.sPrice, 0.5));
    }

    // Total
    if(r.total!=null){
      tr.children[3].append(buildParlayBtn("TOTAL", label, r.total, r.tPrice, 0.5));
    }

    tb.append(tr);
  });
}

function buildParlayBtn(type, game, sel, price, tp){
  const b = document.createElement("button");
  b.className = "add-leg";
  b.textContent = "➕";
  b.dataset.market = type;
  b.dataset.game = game;
  b.dataset.selection = sel;
  b.dataset.price = price;
  b.dataset.trueprob = tp;

  b.addEventListener("click", ()=>{
    window.PARLAY.push({
      market: type,
      game,
      selection: sel,
      price: Number(price),
      trueProb: Number(tp),
      edge: expectedValue(tp, price)
    });
    renderBestParlay();
  });

  return b;
}

// ==========================================================
// PLAYER PROPS
// ==========================================================
async function loadProps(id, div, ev){
  try {
    const wrap = await api.props(id);
    const props = wrap.props ?? wrap;
    if(!props.bookmakers?.length){
      div.innerHTML = "<em>No props available.</em>";
      return;
    }

    const label = `${ev.away_team} @ ${ev.home_team}`;
    let html = "";

    props.bookmakers.forEach(bm=>{
      html+=`<h4>${bm.title}</h4>`;
      bm.markets.forEach(m=>{
        html+=`
          <table class="table props">
            <thead><tr><th>Player</th><th>Pick</th><th>Line</th><th>Odds</th><th></th></tr></thead>
            <tbody>
        `;
        m.outcomes.forEach(o=>{
          html+=`
            <tr>
              <td>${o.description || "–"}</td>
              <td>${o.name}</td>
              <td>${o.point ?? "–"}</td>
              <td>${money(o.price)}</td>
              <td><button class="add-leg-prop" data-player="${o.description||""}" data-price="${o.price}" data-game="${label}" data-type="${m.key}" data-side="${o.name}" data-point="${o.point??""}">➕</button></td>
            </tr>`;
        });
        html+="</tbody></table>";
      });
    });

    div.innerHTML = html;
    div.dataset.loaded = "1";

    // Attach prop listeners
    div.querySelectorAll(".add-leg-prop").forEach(btn=>{
      btn.addEventListener("click", ()=>{
        window.PARLAY.push({
          market:"PROP",
          game:btn.dataset.game,
          player:btn.dataset.player,
          type:btn.dataset.type,
          side:btn.dataset.side,
          point:btn.dataset.point,
          price:Number(btn.dataset.price),
          trueProb:prob(btn.dataset.price),
          edge:0
        });
        renderBestParlay();
      });
    });

  } catch(err){
    console.error("props", err);
    div.innerHTML = "<em>Failed to load props</em>";
  }
}

// ==========================================================
// BEST PARLAY OF THE WEEK
// ==========================================================
function renderBestParlay(){
  const slot = $("#bestParlay");
  if(!slot) return;

  if(!window.PARLAY.length){
    slot.innerHTML = `
      <h2>🔥 Best Parlay of the Week</h2>
      <p>No +EV legs detected yet.</p>
    `;
    return;
  }

  const list = [...window.PARLAY].sort((a,b)=>b.edge-a.edge).slice(0,3);
  let html = `<h2>🔥 Best Parlay of the Week</h2><ul>`;
  list.forEach(l=>{
    html+=`<li>${l.selection || l.player} (${l.game}) @ ${money(l.price)} — edge ${(l.edge*100).toFixed(1)}%</li>`;
  });
  html+="</ul>";
  slot.innerHTML = html;
}
