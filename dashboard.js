import { NFL_TEAMS } from "./teams.js";
import { computeGameAnalytics } from "./script.js"; // re-exported below

// API endpoints
async function getEvents(){ return fetch("/api/events").then(r=>r.json()); }
async function getOdds(){ return fetch("/api/odds").then(r=>r.json()); }

const table = document.querySelector("#dash tbody");
document.querySelector("#refresh").onclick = loadDashboard;

async function loadDashboard(){
  table.innerHTML = "<tr><td colspan='6'>Loading…</td></tr>";

  const [events, oddsWrap] = await Promise.all([getEvents(), getOdds()]);
  const odds = oddsWrap.data ?? oddsWrap;
  const byId = Object.fromEntries(odds.map(g => [g.id,g]));

  const rows = [];

  for(const ev of events){
    const game = byId[ev.id];
    if(!game) continue;

    const ana = computeGameAnalytics(game, ev.away_team, ev.home_team);

    // Pick best EV across books
    let bestEV = 0;
    (game.bookmakers || []).forEach(bm=>{
      (bm.markets||[]).forEach(m=>{
        if(m.key==="h2h"){
          const a = m.outcomes.find(o=>o.name===ana.away);
          const h = m.outcomes.find(o=>o.name===ana.home);
          if(a && h){
            const evAway = ana.nvAway - prob(a.price);
            const evHome = ana.nvHome - prob(h.price);
            bestEV = Math.max(bestEV, evAway, evHome);
          }
        }
      });
    });

    rows.push({
      ev,
      ana,
      kickoff: new Date(ev.commence_time),
      bestEV
    });
  }

  render(rows);
}

function render(rows){
  table.innerHTML = rows.map(r=>{
    const away = NFL_TEAMS[r.ev.away_team];
    const home = NFL_TEAMS[r.ev.home_team];
    
    const spreadLine = r.ana.bestSpread ? r.ana.bestSpread.split(":").join(" ") : "–";
    const totalLine  = r.ana.bestTotal  ? r.ana.bestTotal.split(":").join(" ")  : "–";

    return `
      <tr data-id="${r.ev.id}">
        <td class="team-cell">
          <img src="${away?.logo}" /> ${r.ev.away_team}
          @
          <img src="${home?.logo}" /> ${r.ev.home_team}
        </td>
        <td>${(r.ana.winnerProb*100).toFixed(1)}%</td>
        <td>${spreadLine} <span style="color:#ffcc33;">(${(r.ana.bestSpreadProb*100).toFixed(1)}%)</span></td>
        <td>${totalLine} <span style="color:#9ca7c8;">(${(r.ana.bestTotalProb*100).toFixed(1)}%)</span></td>
        <td>${(r.bestEV*100).toFixed(1)}%</td>
        <td>${r.kickoff.toLocaleString()}</td>
      </tr>
    `;
  }).join("");

  // Click row to go to main page game
  document.querySelectorAll("tr[data-id]").forEach(row=>{
    row.style.cursor = "pointer";
    row.onclick = ()=> window.location.href = "/#" + row.dataset.id;
  });
}

// Sorting
document.querySelectorAll("th[data-sort]").forEach(th=>{
  th.addEventListener("click", ()=>sortTable(th.dataset.sort));
});

let sortDirection = 1;
function sortTable(key){
  const rows = [...table.querySelectorAll("tr")].map(tr=>{
    const id = tr.dataset.id;
    const tds = tr.querySelectorAll("td");
    return {
      tr,
      team: tds[0].innerText,
      win: parseFloat(tds[1].innerText),
      spread: parseFloat(tds[2].innerText),
      total: parseFloat(tds[3].innerText),
      ev: parseFloat(tds[4].innerText),
      kickoff: new Date(tds[5].innerText)
    };
  });

  rows.sort((a,b)=> {
    if(a[key] < b[key]) return -1 * sortDirection;
    if(a[key] > b[key]) return 1 * sortDirection;
    return 0;
  });

  sortDirection *= -1;

  table.innerHTML = rows.map(r=>r.tr.outerHTML).join("");
}

loadDashboard();

// Utilities
function prob(o){
  return o>0 ? 100/(o+100) : -o/(-o+100);
}
