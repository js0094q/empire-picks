import { NFL_TEAMS } from "./teams.js";
import { computeGameAnalytics } from "./script.js";

// API endpoints
async function getEvents(){ return fetch("/api/events").then(r=>r.json()); }
async function getOdds(){ return fetch("/api/odds").then(r=>r.json()); }

const table = document.querySelector("#dash tbody");
const topPanel = document.querySelector("#top5");

document.querySelector("#refresh").onclick = loadDashboard;

async function loadDashboard(){
  table.innerHTML = "<tr><td colspan='6'>Loading…</td></tr>";
  topPanel.innerHTML = "Loading…";

  const [events, oddsWrap] = await Promise.all([getEvents(), getOdds()]);
  const odds = oddsWrap.data ?? oddsWrap;
  const byId = Object.fromEntries(odds.map(g => [g.id,g]));

  const rows = [];
  const edges = [];

  for(const ev of events){
    const game = byId[ev.id];
    if(!game) continue;

    const ana = computeGameAnalytics(game, ev.away_team, ev.home_team);

    // Compute best EV for the entire game for display
    let bestEV = 0;

    game.bookmakers.forEach(bm=>{
      (bm.markets||[]).forEach(m=>{

        // Moneyline EV
        if(m.key==="h2h"){
          const a = m.outcomes.find(o=>o.name===ana.away);
          const h = m.outcomes.find(o=>o.name===ana.home);
          if(a && h){
            const evAway = ana.nvAway - prob(a.price);
            const evHome = ana.nvHome - prob(h.price);

            edges.push({
              type: "Moneyline",
              ev: Math.max(evAway, evHome),
              side: evAway > evHome ? ana.away : ana.home,
              book: bm.title,
              game: `${ev.away_team} @ ${ev.home_team}`,
              kickoff: new Date(ev.commence_time)
            });

            bestEV = Math.max(bestEV, evAway, evHome);
          }
        }

        // Spread EV (Directional confidence crossing)
        if(m.key==="spreads"){
          m.outcomes.forEach(o=>{
            const implied = prob(o.price);
            edges.push({
              type: `Spread ${o.name} ${o.point}`,
              ev: Math.abs(ana.bestSpreadProb - implied),
              book: bm.title,
              side: o.name,
              game: `${ev.away_team} @ ${ev.home_team}`,
              kickoff: new Date(ev.commence_time)
            });
          });
        }

        // Totals EV
        if(m.key==="totals"){
          m.outcomes.forEach(o=>{
            const implied = prob(o.price);
            edges.push({
              type: `Total ${o.name} ${o.point}`,
              ev: Math.abs(ana.bestTotalProb - implied),
              book: bm.title,
              side: o.name,
              game: `${ev.away_team} @ ${ev.home_team}`,
              kickoff: new Date(ev.commence_time)
            });
          });
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
  renderTop5(edges);
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
          <img src="${away?.logo}" /> ${r.ev.away_team} @
          <img src="${home?.logo}" /> ${r.ev.home_team}
        </td>
        <td>${(r.ana.winnerProb*100).toFixed(1)}%</td>
        <td>${spreadLine} <span style="color:#ffcc33;">(${(r.ana.bestSpreadProb*100).toFixed(1)}%)</span></td>
        <td>${totalLine} <span style="color:#9ca7c8;">(${(r.ana.bestTotalProb*100).toFixed(1)}%)</span></td>
        <td><strong style="color:#28d16c;">${(r.bestEV*100).toFixed(1)}%</strong></td>
        <td>${r.kickoff.toLocaleString()}</td>
      </tr>
    `;
  }).join("");

  // Click row → scroll to game on main page
  document.querySelectorAll("tr[data-id]").forEach(row=>{
    row.style.cursor = "pointer";
    row.onclick = ()=> window.location.href = "/#" + row.dataset.id;
  });
}

// ------------------------------
// SORTING
// ------------------------------
document.querySelectorAll("th[data-sort]").forEach(th=>{
  th.addEventListener("click", ()=>sortTable(th.dataset.sort, th));
});

let sortDirection = 1;
function sortTable(key, header){
  const rows = [...table.querySelectorAll("tr")].map(tr=>{
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

  rows.sort((a,b)=>{
    if(a[key] < b[key]) return -1 * sortDirection;
    if(a[key] > b[key]) return 1 * sortDirection;
    return 0;
  });

  sortDirection *= -1;

  table.innerHTML = rows.map(r=>r.tr.outerHTML).join("");

  document.querySelectorAll("th").forEach(th=>th.style.color="#fff");
  header.style.color = "#ffcc33";
}

// ------------------------------
// TOP 5 BEST EV PANEL
// ------------------------------
function renderTop5(edges){
  const top = edges
    .sort((a,b)=>b.ev - a.ev)
    .slice(0,5);

  topPanel.innerHTML = `
    <h2 style="color:#ffcc33;margin-bottom:8px;">⭐ Top 5 Best Value Bets This Week</h2>
    ${top.map(e=>`
      <div style="
        background:#141a33;
        padding:10px;
        margin-bottom:6px;
        border-radius:8px;
        border-left:4px solid #28d16c;
      ">
        <strong>${e.game}</strong><br>
        <span style="color:#28d16c;font-weight:700;">${(e.ev*100).toFixed(1)}% Edge</span><br>
        Bet: <strong>${e.type}</strong> (${e.side}) @ <strong>${e.book}</strong><br>
        <small>${e.kickoff.toLocaleString()}</small>
      </div>
    `).join("")}
  `;
}

// Utilities
function prob(o){
  return o>0 ? 100/(o+100) : -o/(-o+100);
}

loadDashboard();
