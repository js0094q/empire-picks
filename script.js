// ====== Simple helpers ======
const $ = (s, c=document)=>c.querySelector(s);
const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));

const money = o => o>0?`+${o}`:o;
const implied = o => o>0?100/(o+100):-o/(-o+100);
const avg = a => a.length? a.reduce((x,y)=>x+y,0)/a.length : 0;

// ====== API wrappers (using your serverless routes) ======
const api = {
  async events()  { return fetch("/api/events").then(r=>r.json()); },
  async odds()    { return fetch("/api/odds").then(r=>r.json()); },
  async props(id) { return fetch(`/api/event-odds?eventId=${id}`).then(r=>r.json()); }
};

// ====== UI ======
const gamesEl = $("#games");
$("#refreshBtn").addEventListener("click", loadAll);

async function loadAll(){
  gamesEl.textContent = "Loading NFL Week data...";
  const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
  const odds = oddsWrap.data ?? oddsWrap; // handle wrapped form

  // Merge odds by id
  const byId = Object.fromEntries(odds.map(g=>[g.id,g]));
  const weekGames = events.filter(ev=>byId[ev.id]);

  gamesEl.innerHTML="";
  for(const ev of weekGames){
    const gameOdds = byId[ev.id];
    gamesEl.appendChild(renderGame(ev, gameOdds));
  }
}

// ====== Build game card ======
function renderGame(ev, odds){
  const card = document.createElement("div");
  card.className="card";

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

  renderLines($("#lines", card), odds);

  // Tab switching
  $$(".tab", card).forEach(tab=>{
    tab.addEventListener("click",()=>{
      $$(".tab", card).forEach(t=>t.classList.remove("active"));
      $$(".tab-content", card).forEach(c=>c.classList.remove("active"));
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

// ====== Game lines table ======
function renderLines(container, game){
  const rows=[];
  (game.bookmakers||[]).slice(0,8).forEach(bm=>{
    const book=bm.title;
    const rec={book,h2h:"–",spread:"–",total:"–",ev:""};
    bm.markets.forEach(m=>{
      if(m.key==="h2h"){
        const away=m.outcomes.find(o=>o.name===game.away_team);
        const home=m.outcomes.find(o=>o.name===game.home_team);
        if(away&&home){
          rec.h2h=`${money(away.price)} / ${money(home.price)}`;
          const evv = implied(away.price)+implied(home.price);
          rec.ev = evv>1 ? "<span class='ev-neg'>-vig</span>" : "<span class='ev-pos'>fair</span>";
        }
      }
      if(m.key==="spreads"){
        const best=m.outcomes.sort((a,b)=>Math.abs(a.point)-Math.abs(b.point))[0];
        if(best) rec.spread=`${best.name} ${best.point} (${money(best.price)})`;
      }
      if(m.key==="totals"){
        const o=m.outcomes.find(x=>x.name.toLowerCase()==="over");
        const u=m.outcomes.find(x=>x.name.toLowerCase()==="under");
        if(o&&u) rec.total=`O${o.point} / U${u.point}`;
      }
    });
    rows.push(rec);
  });

  container.innerHTML=`
    <table class="table">
      <thead><tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th><th>EV</th></tr></thead>
      <tbody>${rows.map(r=>`
        <tr><td>${r.book}</td><td>${r.h2h}</td><td>${r.spread}</td><td>${r.total}</td><td>${r.ev}</td></tr>
      `).join("")}</tbody>
    </table>`;
}

// ====== Player props loader ======
async function loadProps(id, container){
  const wrap = await api.props(id);
  const props = wrap.props ?? wrap;
  container.dataset.loaded="1";
  if(!props.bookmakers){ container.textContent="No props yet."; return; }

  const groups={};
  props.bookmakers.forEach(bm=>{
    bm.markets.forEach(m=>{
      if(!groups[m.key]) groups[m.key]=[];
      m.outcomes.forEach(o=>{
        groups[m.key].push({
          book:bm.title, player:o.description||"–",
          name:o.name, point:o.point, price:o.price
        });
      });
    });
  });

  const order=["player_anytime_td","player_pass_tds","player_pass_yds","player_rush_yds","player_receptions"];
  let html="";
  for(const k of order){
    const arr=groups[k];
    if(!arr) continue;
    html+=`<h4>${label(k)}</h4>
      <table class="table"><thead><tr><th>Book</th><th>Player</th><th>Pick</th><th>Line</th><th>Price</th></tr></thead>
      <tbody>${arr.slice(0,40).map(r=>`
        <tr><td>${r.book}</td><td>${r.player}</td><td>${r.name}</td><td>${r.point??"–"}</td><td>${money(r.price)}</td></tr>
      `).join("")}</tbody></table>`;
  }
  container.innerHTML=html||"<em>No props data available.</em>";
}

function label(k){
  return ({
    player_anytime_td:"Anytime TD",
    player_pass_tds:"Pass TDs (O/U)",
    player_pass_yds:"Pass Yards (O/U)",
    player_rush_yds:"Rush Yards (O/U)",
    player_receptions:"Receptions (O/U)"
  })[k] || k;
}

// ====== Start ======
loadAll();
