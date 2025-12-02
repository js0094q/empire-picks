import { computeGameAnalytics } from "./script.js";

async function loadDashboard() {
  try {
    const events = await fetch("/api/events").then(r => r.json());
    const odds = await fetch("/api/odds").then(r => r.json());

    // Create a lookup table for odds by game id
    const oddsById = Object.fromEntries(odds.map(g => [g.id, g]));

    const table = document.querySelector("#dashboard");
    table.innerHTML = "";

    events.forEach(ev => {
      const gameOdds = oddsById[ev.id];
      if (!gameOdds) return;

      const analytics = computeGameAnalytics(
        gameOdds,
        ev.away_team,
        ev.home_team
      );

      table.appendChild(renderRow(ev, analytics));
    });
  } catch (err) {
    console.error("DASHBOARD LOAD ERROR:", err);
    document.querySelector("#dashboard").innerHTML =
      "<tr><td colspan='6'>Failed to load analytics.</td></tr>";
  }
}

loadDashboard();
    const ana = computeGameAnalytics(game, ev.away_team, ev.home_team);
    const kickoff = new Date(ev.commence_time);

    // ---- collect edges + legs from moneylines, spreads, totals ----
    (game.bookmakers || []).forEach(bm=>{
      (bm.markets || []).forEach(m=>{

        // Moneyline
        if(m.key==="h2h"){
          const a = m.outcomes.find(o=>o.name===ana.away);
          const h = m.outcomes.find(o=>o.name===ana.home);
          if(a && h){
            const impliedA = prob(a.price);
            const impliedH = prob(h.price);

            const evAway = ana.nvAway - impliedA;
            const evHome = ana.nvHome - impliedH;

            // for dashboard "edges"
            edges.push({
              type: "Moneyline",
              ev: Math.max(evAway, evHome),
              side: evAway > evHome ? ana.away : ana.home,
              book: bm.title,
              game: `${ev.away_team} @ ${ev.home_team}`,
              kickoff
            });

            // for parlay optimizer: we store each side as its own leg
            legsForParlays.push({
              eventId: ev.id,
              game: `${ev.away_team} @ ${ev.home_team}`,
              team: ana.away,
              book: bm.title,
              price: a.price,
              trueProb: ana.nvAway,
              impliedProb: impliedA,
              edge: evAway,
              market: "ML",
              kickoff
            });
            legsForParlays.push({
              eventId: ev.id,
              game: `${ev.away_team} @ ${ev.home_team}`,
              team: ana.home,
              book: bm.title,
              price: h.price,
              trueProb: ana.nvHome,
              impliedProb: impliedH,
              edge: evHome,
              market: "ML",
              kickoff
            });
          }
        }

        // Spreads
        if(m.key==="spreads"){
          m.outcomes.forEach(o=>{
            const implied = prob(o.price);
            edges.push({
              type: `Spread ${o.name} ${o.point}`,
              ev: Math.abs(ana.bestSpreadProb - implied),
              book: bm.title,
              side: o.name,
              game: `${ev.away_team} @ ${ev.home_team}`,
              kickoff
            });
          });
        }

        // Totals
        if(m.key==="totals"){
          m.outcomes.forEach(o=>{
            const implied = prob(o.price);
            edges.push({
              type: `Total ${o.name} ${o.point}`,
              ev: Math.abs(ana.bestTotalProb - implied),
              book: bm.title,
              side: o.name,
              game: `${ev.away_team} @ ${ev.home_team}`,
              kickoff
            });
          });
        }

      });
    });

    // ---- per-game row for table ----
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
      kickoff,
      bestEV
    });
  }

  globalLegs = legsForParlays;
  globalRows = rows;

  render(rows);
  renderTop5(edges);
  parlayResults.textContent = "Click ⚡ Generate to see parlay suggestions.";
}

// ========================================================
// TABLE RENDER
// ========================================================
function render(rows){
  table.innerHTML = rows.map(r=>{
    const away = NFL_TEAMS[r.ev.away_team];
    const home = NFL_TEAMS[r.ev.home_team];

    const spreadLine = r.ana.bestSpread ? r.ana.bestSpread.split(":").join(" ") : "–";
    const totalLine  = r.ana.bestTotal  ? r.ana.bestTotal.split(":").join(" ")  : "–";

    return `
      <tr data-id="${r.ev.id}">
        <td class="team-cell">
          <img src="${away?.logo || ""}" /> ${r.ev.away_team} @
          <img src="${home?.logo || ""}" /> ${r.ev.home_team}
        </td>
        <td>${(r.ana.winnerProb*100).toFixed(1)}%</td>
        <td>${spreadLine} <span style="color:#ffcc33;">(${(r.ana.bestSpreadProb*100).toFixed(1)}%)</span></td>
        <td>${totalLine} <span style="color:#9ca7c8;">(${(r.ana.bestTotalProb*100).toFixed(1)}%)</span></td>
        <td><strong style="color:#28d16c;">${(r.bestEV*100).toFixed(1)}%</strong></td>
        <td>${r.kickoff.toLocaleString()}</td>
      </tr>
    `;
  }).join("");

  // click to jump to game on main page
  document.querySelectorAll("tr[data-id]").forEach(row=>{
    row.style.cursor = "pointer";
    row.onclick = ()=> window.location.href = "/#" + row.dataset.id;
  });
}

// ========================================================
// SORTING
// ========================================================
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
    if(a[key] > b[key]) return  1 * sortDirection;
    return 0;
  });

  sortDirection *= -1;

  table.innerHTML = rows.map(r=>r.tr.outerHTML).join("");

  document.querySelectorAll("th").forEach(th=>th.style.color="#fff");
  header.style.color = "#ffcc33";
}

// ========================================================
// TOP 5 SINGLE-LEG EDGES
// ========================================================
function renderTop5(edges){
  const top = edges
    .sort((a,b)=>b.ev - a.ev)
    .slice(0,5);

  topPanel.innerHTML = `
    <h2 style="color:#ffcc33;margin-bottom:8px;">⭐ Top 5 Best Value Bets</h2>
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

// ========================================================
// PARLAY EV OPTIMIZER (2-leg ML parlays)
// ========================================================
function buildParlays(legs){
  if(!legs || !legs.length){
    parlayResults.textContent = "No legs available yet.";
    return;
  }

  const minEdge = parseFloat(parlayEdgeFilter.value) || 0.02;

  // Filter to decent single-leg edges
  const filtered = legs
    .filter(l => l.edge > minEdge)
    .sort((a,b)=>b.edge - a.edge)
    .slice(0, 20); // cap for performance

  if(filtered.length < 2){
    parlayResults.textContent = "Not enough high-edge legs to build parlays with current filter.";
    return;
  }

  const parlays = [];

  for(let i=0;i<filtered.length;i++){
    for(let j=i+1;j<filtered.length;j++){
      const a = filtered[i];
      const b = filtered[j];

      // avoid same game double-leg (simple approximation)
      if(a.eventId === b.eventId) continue;

      const legsArr = [a,b];

      const trueProb = a.trueProb * b.trueProb;

      const decA = americanToDecimal(a.price);
      const decB = americanToDecimal(b.price);
      const parlayDec = decA * decB;

      const impliedProb = 1 / parlayDec;

      const edge = trueProb - impliedProb;

      parlays.push({
        legs: legsArr,
        trueProb,
        impliedProb,
        edge
      });
    }
  }

  const top = parlays
    .filter(p => p.edge > 0)
    .sort((a,b)=>b.edge - a.edge)
    .slice(0,5);

  if(!top.length){
    parlayResults.textContent = "No positive EV 2-leg parlays found with current filter.";
    return;
  }

  parlayResults.innerHTML = top.map(p=>{
    const legLines = p.legs.map(l=>`
      <li>
        <strong>${l.team}</strong> ML @ <strong>${l.book}</strong>
        <span style="color:#9ca7c8;">
          (${l.game}, ${l.kickoff.toLocaleString()}, ${formatAmerican(l.price)})
        </span>
      </li>
    `).join("");

    return `
      <div style="
        margin-top:10px;
        padding:10px;
        border-radius:10px;
        background:#10152b;
        border:1px solid #28d16c;
      ">
        <div style="margin-bottom:4px;">
          <strong style="color:#28d16c;">Parlay Edge: ${(p.edge*100).toFixed(2)}%</strong>
          <span style="margin-left:8px;color:#ffcc33;">
            True hit rate ${(p.trueProb*100).toFixed(1)}% vs book ${(p.impliedProb*100).toFixed(1)}%
          </span>
        </div>
        <ul style="margin:0;padding-left:18px;font-size:0.9rem;">
          ${legLines}
        </ul>
      </div>
    `;
  }).join("");
}

// ========================================================
// UTILITIES
// ========================================================
function prob(o){
  return o>0 ? 100/(o+100) : -o/(-o+100);
}

function americanToDecimal(o){
  return o > 0 ? 1 + o/100 : 1 + 100/(-o);
}

function formatAmerican(o){
  return o > 0 ? `+${o}` : `${o}`;
}

// ========================================================
loadDashboard();
