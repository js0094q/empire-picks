// ===========================
// EmpirePicks — script.js (FINAL POLISHED VERSION)
// ===========================

// ---------- Helpers ----------
const $ = (s, c=document)=>c.querySelector(s);
const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));
const money = o => (o>0?`+${round(o,1)}`:round(o,1));
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const round = (n,p=1)=>Math.round(n*10**p)/10**p;

// ---------- NFL Logos ----------
const logos = {
  "Arizona Cardinals":"https://a.espncdn.com/i/teamlogos/nfl/500/ari.png",
  "Atlanta Falcons":"https://a.espncdn.com/i/teamlogos/nfl/500/atl.png",
  "Baltimore Ravens":"https://a.espncdn.com/i/teamlogos/nfl/500/bal.png",
  "Buffalo Bills":"https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
  "Carolina Panthers":"https://a.espncdn.com/i/teamlogos/nfl/500/car.png",
  "Chicago Bears":"https://a.espncdn.com/i/teamlogos/nfl/500/chi.png",
  "Cincinnati Bengals":"https://a.espncdn.com/i/teamlogos/nfl/500/cin.png",
  "Cleveland Browns":"https://a.espncdn.com/i/teamlogos/nfl/500/cle.png",
  "Dallas Cowboys":"https://a.espncdn.com/i/teamlogos/nfl/500/dal.png",
  "Denver Broncos":"https://a.espncdn.com/i/teamlogos/nfl/500/den.png",
  "Detroit Lions":"https://a.espncdn.com/i/teamlogos/nfl/500/det.png",
  "Green Bay Packers":"https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
  "Houston Texans":"https://a.espncdn.com/i/teamlogos/nfl/500/hou.png",
  "Indianapolis Colts":"https://a.espncdn.com/i/teamlogos/nfl/500/ind.png",
  "Jacksonville Jaguars":"https://a.espncdn.com/i/teamlogos/nfl/500/jax.png",
  "Kansas City Chiefs":"https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
  "Las Vegas Raiders":"https://a.espncdn.com/i/teamlogos/nfl/500/lv.png",
  "Los Angeles Chargers":"https://a.espncdn.com/i/teamlogos/nfl/500/lac.png",
  "Los Angeles Rams":"https://a.espncdn.com/i/teamlogos/nfl/500/lar.png",
  "Miami Dolphins":"https://a.espncdn.com/i/teamlogos/nfl/500/mia.png",
  "Minnesota Vikings":"https://a.espncdn.com/i/teamlogos/nfl/500/min.png",
  "New England Patriots":"https://a.espncdn.com/i/teamlogos/nfl/500/ne.png",
  "New Orleans Saints":"https://a.espncdn.com/i/teamlogos/nfl/500/no.png",
  "New York Giants":"https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png",
  "New York Jets":"https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png",
  "Philadelphia Eagles":"https://a.espncdn.com/i/teamlogos/nfl/500/phi.png",
  "Pittsburgh Steelers":"https://a.espncdn.com/i/teamlogos/nfl/500/pit.png",
  "San Francisco 49ers":"https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
  "Seattle Seahawks":"https://a.espncdn.com/i/teamlogos/nfl/500/sea.png",
  "Tampa Bay Buccaneers":"https://a.espncdn.com/i/teamlogos/nfl/500/tb.png",
  "Tennessee Titans":"https://a.espncdn.com/i/teamlogos/nfl/500/ten.png",
  "Washington Commanders":"https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png"
};

// ---------- API ----------
const api = {
  async events(){ return fetch("/api/events").then(r=>r.json()); },
  async odds(){ return fetch("/api/odds").then(r=>r.json()); },
  async props(id){ return fetch(`/api/event-odds?eventId=${id}`).then(r=>r.json()); }
};

// ---------- Initialization ----------
const gamesEl = $("#games");
$("#refreshBtn").addEventListener("click", loadAll);
loadAll();

// ---------- Load and Render ----------
async function loadAll(){
  gamesEl.textContent = "Loading NFL week data...";
  const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
  const odds = oddsWrap.data ?? oddsWrap;
  const byId = Object.fromEntries(odds.map(g=>[g.id,g]));
  const weekGames = events.filter(ev => byId[ev.id]);
  gamesEl.innerHTML="";

  for(const ev of weekGames){
    gamesEl.appendChild(renderGame(ev, byId[ev.id]));
  }
}

// ---------- Game Card ----------
function renderGame(ev, odds){
  const card = document.createElement("div");
  card.className="card";
  const kickoff = new Date(ev.commence_time).toLocaleString("en-US",{
    month:"short",day:"numeric",hour:"numeric",minute:"2-digit"
  });
  const summary = aggregateGameOdds(odds, ev);
  const awayLogo = logos[ev.away_team] || "";
  const homeLogo = logos[ev.home_team] || "";

  card.innerHTML = `
    <div class="card-header">
      <div style="display:flex;align-items:center;justify-content:space-between;">
        <div style="display:flex;align-items:center;gap:8px;">
          <img src="${awayLogo}" width="36" height="36" alt="${ev.away_team}">
          <strong>${ev.away_team}</strong> @ 
          <strong>${ev.home_team}</strong>
          <img src="${homeLogo}" width="36" height="36" alt="${ev.home_team}">
        </div>
        <small>${kickoff}</small>
      </div>
    </div>

    <div class="tabs">
      <div class="tab active" data-tab="summary">Summary</div>
      <div class="tab" data-tab="props">Player Props</div>
    </div>

    <div class="tab-content active" id="summary">
      <div class="odds-summary" style="padding:0.8rem;">
        <p><strong>Moneyline:</strong> ${summary.moneyline}</p>
        <p><strong>Spread:</strong> ${summary.spread}</p>
        <p><strong>Total:</strong> ${summary.total}</p>
      </div>
    </div>

    <div class="tab-content" id="props"><em>Loading player props...</em></div>
  `;

  // Tab switching
  $$(".tab", card).forEach(tab=>{
    tab.addEventListener("click",()=>{
      $$(".tab",card).forEach(t=>t.classList.remove("active"));
      $$(".tab-content",card).forEach(c=>c.classList.remove("active"));
      tab.classList.add("active");
      const content = card.querySelector(`#${tab.dataset.tab}`);
      content.classList.add("active");
      if(tab.dataset.tab==="props" && !content.dataset.loaded){
        loadProps(ev.id, content);
      }
    });
  });

  return card;
}

// ---------- Aggregate Game Odds ----------
function aggregateGameOdds(game, ev){
  const h2hOdds=[], spreads=[], totalsOver=[], totalsUnder=[];
  (game.bookmakers||[]).forEach(bm=>{
    bm.markets.forEach(m=>{
      if(m.key==="h2h"){
        const away=m.outcomes.find(o=>o.name===ev.away_team);
        const home=m.outcomes.find(o=>o.name===ev.home_team);
        if(away&&home) h2hOdds.push({away:away.price,home:home.price});
      }
      if(m.key==="spreads"){
        m.outcomes.forEach(o=>spreads.push({team:o.name,point:o.point}));
      }
      if(m.key==="totals"){
        const ovr=m.outcomes.find(o=>o.name.toLowerCase()==="over");
        const und=m.outcomes.find(o=>o.name.toLowerCase()==="under");
        if(ovr) totalsOver.push(ovr.point);
        if(und) totalsUnder.push(und.point);
      }
    });
  });

  const awayAvg = avg(h2hOdds.map(x=>x.away));
  const homeAvg = avg(h2hOdds.map(x=>x.home));

  // Determine favorite from average moneyline (lower absolute value = favorite)
  const favorite = Math.abs(homeAvg) < Math.abs(awayAvg) ? ev.home_team : ev.away_team;

  // Spread — pick the average of the favorite's lines
  let spread = "–";
  if(spreads.length){
    const favSpreads = spreads.filter(s=>s.team===favorite);
    const spreadVal = favSpreads.length ? round(avg(favSpreads.map(s=>s.point)),1) : round(avg(spreads.map(s=>s.point)),1);
    spread = `${favorite} ${spreadVal>0?"+":""}${spreadVal}`;
  }

  // Totals average
  const oAvg = round(avg(totalsOver),1);
  const uAvg = round(avg(totalsUnder),1);
  const total = (oAvg && uAvg) ? `O${oAvg}/U${uAvg}` : "–";

  return {
    moneyline:`${money(awayAvg)} / ${money(homeAvg)}`,
    spread,
    total
  };
}

// ---------- Player Props ----------
async function loadProps(id, container){
  const wrap = await api.props(id);
  const props = wrap.props ?? wrap;
  container.dataset.loaded="1";
  if(!props.bookmakers){ container.textContent="No props available."; return; }

  const groups={};
  props.bookmakers.forEach(bm=>{
    bm.markets.forEach(m=>{
      m.outcomes.forEach(o=>{
        const key=`${m.key}::${o.description}`;
        if(!groups[key]) groups[key]=[];
        groups[key].push({price:o.price, name:o.name, point:o.point});
      });
    });
  });

  const ordered = [
    "player_anytime_td",
    "player_pass_tds",
    "player_pass_yds",
    "player_rush_yds",
    "player_receptions"
  ];

  let html="";
  for(const k of ordered){
    const entries=Object.entries(groups).filter(([key])=>key.startsWith(k));
    if(!entries.length) continue;
    html+=`<h4>${label(k)}</h4>`;
    html+="<table class='table'><thead><tr><th>Player</th><th>Pick</th><th>Line</th><th>Avg Odds</th></tr></thead><tbody>";
    for(const [key,arr] of entries){
      const player=key.split("::")[1]||"–";
      const avgOdds=round(avg(arr.map(a=>a.price)),1);
      const detail=arr[0];
      const lineVal=detail.point!==undefined?detail.point:"–";
      html+=`<tr><td>${player}</td><td>${detail.name}</td><td>${lineVal}</td><td>${money(avgOdds)}</td></tr>`;
    }
    html+="</tbody></table>";
  }

  container.innerHTML=html||"<em>No player props found.</em>";
}

function label(k){
  return ({
    player_anytime_td:"Anytime TD (Yes/No)",
    player_pass_tds:"Passing TDs (O/U)",
    player_pass_yds:"Passing Yards (O/U)",
    player_rush_yds:"Rushing Yards (O/U)",
    player_receptions:"Receptions (O/U)"
  })[k] || k;
}