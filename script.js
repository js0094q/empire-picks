// ====== Utility Helpers ======
const $ = (s, c=document)=>c.querySelector(s);
const $$ = (s, c=document)=>Array.from(c.querySelectorAll(s));

const money = o => (o>0?`+${o}`:o);
const implied = o => (o>0?100/(o+100):-o/(-o+100));
const avg = a => a.length ? a.reduce((x,y)=>x+y,0)/a.length : 0;
const round = (n, p=1) => Math.round(n * Math.pow(10,p)) / Math.pow(10,p);

// ====== Team Logos ======
const logos = {
  "Buffalo Bills": "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
  "Miami Dolphins": "https://a.espncdn.com/i/teamlogos/nfl/500/mia.png",
  "New England Patriots": "https://a.espncdn.com/i/teamlogos/nfl/500/ne.png",
  "New York Jets": "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png",
  "Kansas City Chiefs": "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
  "Las Vegas Raiders": "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png",
  "Denver Broncos": "https://a.espncdn.com/i/teamlogos/nfl/500/den.png",
  "Los Angeles Chargers": "https://a.espncdn.com/i/teamlogos/nfl/500/lac.png",
  "Baltimore Ravens": "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png",
  "Cincinnati Bengals": "https://a.espncdn.com/i/teamlogos/nfl/500/cin.png",
  "Cleveland Browns": "https://a.espncdn.com/i/teamlogos/nfl/500/cle.png",
  "Pittsburgh Steelers": "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png",
  "Indianapolis Colts": "https://a.espncdn.com/i/teamlogos/nfl/500/ind.png",
  "Houston Texans": "https://a.espncdn.com/i/teamlogos/nfl/500/hou.png",
  "Jacksonville Jaguars": "https://a.espncdn.com/i/teamlogos/nfl/500/jax.png",
  "Tennessee Titans": "https://a.espncdn.com/i/teamlogos/nfl/500/ten.png",
  "Dallas Cowboys": "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png",
  "Philadelphia Eagles": "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png",
  "New York Giants": "https://a.espncdn.com/i/teamlogos/nfl/500/nyg.png",
  "Washington Commanders": "https://a.espncdn.com/i/teamlogos/nfl/500/wsh.png",
  "San Francisco 49ers": "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
  "Seattle Seahawks": "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png",
  "Los Angeles Rams": "https://a.espncdn.com/i/teamlogos/nfl/500/lar.png",
  "Arizona Cardinals": "https://a.espncdn.com/i/teamlogos/nfl/500/ari.png",
  "Chicago Bears": "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png",
  "Detroit Lions": "https://a.espncdn.com/i/teamlogos/nfl/500/det.png",
  "Green Bay Packers": "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
  "Minnesota Vikings": "https://a.espncdn.com/i/teamlogos/nfl/500/min.png",
  "Tampa Bay Buccaneers": "https://a.espncdn.com/i/teamlogos/nfl/500/tb.png",
  "Atlanta Falcons": "https://a.espncdn.com/i/teamlogos/nfl/500/atl.png",
  "New Orleans Saints": "https://a.espncdn.com/i/teamlogos/nfl/500/no.png",
  "Carolina Panthers": "https://a.espncdn.com/i/teamlogos/nfl/500/car.png"
};

// ====== API Wrappers ======
const api = {
  async events()  { return fetch("/api/events").then(r=>r.json()); },
  async odds()    { return fetch("/api/odds").then(r=>r.json()); },
  async props(id) { return fetch(`/api/event-odds?eventId=${id}`).then(r=>r.json()); }
};

// ====== Initialize ======
const gamesEl = $("#games");
$("#refreshBtn").addEventListener("click", loadAll);
loadAll();

async function loadAll(){
  gamesEl.textContent = "Loading aggregate odds data...";
  const [events, oddsWrap] = await Promise.all([api.events(), api.odds()]);
  const odds = oddsWrap.data ?? oddsWrap;
  const byId = Object.fromEntries(odds.map(g=>[g.id,g]));
  const weekGames = events.filter(ev => byId[ev.id]);

  gamesEl.innerHTML="";
  for(const ev of weekGames){
    gamesEl.appendChild(renderGame(ev, byId[ev.id]));
  }
}

// ====== Core Renderer ======
function renderGame(ev, odds){
  const card = document.createElement("div");
  card.className="card";
  const kickoff = new Date(ev.commence_time).toLocaleString("en-US", { 
    weekday:"short", month:"short", day:"numeric", hour:"numeric", minute:"2-digit"
  });
  const summary = aggregateGameOdds(odds, ev);

  const awayLogo = logos[ev.away_team] || "";
  const homeLogo = logos[ev.home_team] || "";
  const evClass = summary.ev > 0 ? "ev-pos" : "ev-neg";

  card.innerHTML = `
    <div class="card-header flex items-center justify-between">
      <div class="teams" style="display:flex;align-items:center;gap:10px;">
        <img src="${awayLogo}" alt="${ev.away_team}" style="width:36px;height:36px;">
        <strong>${ev.away_team}</strong> @ 
        <strong>${ev.home_team}</strong>
        <img src="${homeLogo}" alt="${ev.home_team}" style="width:36px;height:36px;">
      </div>
      <small>${kickoff}</small>
    </div>
    <div class="card-body" style="padding:0.8rem;">
      <p><strong>Moneyline:</strong> ${summary.moneyline}</p>
      <p><strong>Spread:</strong> ${summary.spread}</p>
      <p><strong>Total:</strong> ${summary.total}</p>
      <p><strong>EV:</strong> <span class="${evClass}">${summary.ev > 0 ? "+"+summary.ev : summary.ev}%</span></p>
    </div>
  `;
  return card;
}

// ====== Aggregate and EV Computation ======
function aggregateGameOdds(game, ev){
  const moneyline = [];
  const spreads = [];
  const totals = [];

  (game.bookmakers||[]).forEach(bm=>{
    bm.markets.forEach(m=>{
      if(m.key==="h2h"){
        const away=m.outcomes.find(o=>o.name===ev.away_team);
        const home=m.outcomes.find(o=>o.name===ev.home_team);
        if(away&&home){
          moneyline.push({away:away.price, home:home.price});
        }
      }
      if(m.key==="spreads"){
        m.outcomes.forEach(o=>spreads.push(o.point));
      }
      if(m.key==="totals"){
        m.outcomes.forEach(o=>totals.push(o.point));
      }
    });
  });

  // Average and implied probability normalization (no-vig fair line)
  const awayOdds = avg(moneyline.map(x=>x.away));
  const homeOdds = avg(moneyline.map(x=>x.home));
  const impAway = implied(awayOdds);
  const impHome = implied(homeOdds);
  const normFactor = impAway + impHome;
  const fairAway = impAway / normFactor;
  const fairHome = impHome / normFactor;
  const fairLineAway = moneylineFair(fairAway);
  const fairLineHome = moneylineFair(fairHome);

  const totalAvg = round(avg(totals));
  const spreadAvg = round(avg(spreads),1);
  const evPercent = round((fairAway + fairHome - 1)*100,1);

  return {
    moneyline: `${money(fairLineAway)} / ${money(fairLineHome)}`,
    spread: spreadAvg ? `${spreadAvg > 0 ? "+"+spreadAvg : spreadAvg}` : "–",
    total: totalAvg ? `O${totalAvg}/U${totalAvg}` : "–",
    ev: evPercent
  };
}

// Converts normalized probability back into fair American odds
function moneylineFair(prob){
  return prob>0.5 ? -round((prob/(1-prob))*100) : round(((1-prob)/prob)*100);
}
