// =============================================================
//  EMPIREPICKS – DASHBOARD.JS
//  Uses global Auth + TeamAssets + computeGameAnalytics
// =============================================================


// ------------------ DOM ------------------
const tableBody = document.querySelector("#dash tbody");
const topPanel = document.querySelector("#top5");
const parlayResults = document.querySelector("#parlayResults");
const minEdgeInput = document.querySelector("#parlayEdgeFilter");
document.querySelector("#refresh").onclick = loadDashboard;
document.querySelector("#generateParlays").onclick = () => buildParlays(globalLegs);

let globalLegs = []; // legs with EV edges

// ------------------ Helpers ------------------
function prob(o) {
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}

function americanToDecimal(o) {
  return o > 0 ? 1 + o / 100 : 1 + 100 / -o;
}

function money(o) {
  return o > 0 ? `+${o}` : `${o}`;
}

function combos(arr, k) {
  const res = [];
  function pick(start, stack) {
    if (stack.length === k) return res.push([...stack]);
    for (let i = start; i < arr.length; i++) {
      stack.push(arr[i]);
      pick(i + 1, stack);
      stack.pop();
    }
  }
  pick(0, []);
  return res;
}

// ------------------ Load ------------------
async function loadDashboard() {
  tableBody.innerHTML = `<tr><td colspan="6">Loading...</td></tr>`;
  topPanel.innerHTML = `<div class="muted">Loading...</div>`;
  parlayResults.innerHTML = "";

  try {
    const events = await apiGET("/api/events");
    const oddsWrap = await apiGET("/api/odds");
    const odds = oddsWrap.data ?? oddsWrap;
    const map = Object.fromEntries(odds.map(g => [g.id, g]));

    const now = Date.now();
    const cutoff = 4 * 60 * 60 * 1000;

    const active = events.filter(ev => {
      const g = map[ev.id];
      if (!g) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoff;
    });

    globalLegs = [];
    const rows = [];

    active.forEach(ev => {
      const game = map[ev.id];
      const analytics = computeGameAnalytics(game, ev.away_team, ev.home_team);

      const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
        timeZone: "America/New_York",
        hour: "numeric",
        minute: "2-digit",
        month: "short",
        day: "numeric"
      });

      let bestLeg = null;
      let bestEdge = 0;

      game.bookmakers.forEach(bm => {
        (bm.markets || []).forEach(m => {
          if (m.key === "h2h") {
            const a = m.outcomes.find(o => o.name === ev.away_team);
            const h = m.outcomes.find(o => o.name === ev.home_team);
            if (a && h) {
              const edgeA = analytics.nvA - prob(a.price);
              const edgeH = analytics.nvH - prob(h.price);

              if (edgeA > bestEdge) {
                bestEdge = edgeA;
                bestLeg = {
                  game: `${ev.away_team} @ ${ev.home_team}`,
                  market: "ML",
                  side: ev.away_team,
                  odds: a.price,
                  book: bm.title,
                  kickoff: kickoffLocal,
                  edge: edgeA,
                  fair: analytics.nvA
                };
              }
              if (edgeH > bestEdge) {
                bestEdge = edgeH;
                bestLeg = {
                  game: `${ev.away_team} @ ${ev.home_team}`,
                  market: "ML",
                  side: ev.home_team,
                  odds: h.price,
                  book: bm.title,
                  kickoff: kickoffLocal,
                  edge: edgeH,
                  fair: analytics.nvH
                };
              }
            }
          }
        });
      });

      if (bestLeg) {
        globalLegs.push(bestLeg);
        rows.push(bestLeg);
      }
    });

    rows.sort((a, b) => b.edge - a.edge);
    renderTable(rows);
    renderTop5(globalLegs);
  } catch (e) {
    console.error(e);
    tableBody.innerHTML = `<tr><td colspan="6" class="error">Failed loading dashboard.</td></tr>`;
  }
}

// ------------------ Render Table ------------------
function renderTable(rows) {
  if (!rows.length) {
    tableBody.innerHTML = `<tr><td colspan="6">No active games.</td></tr>`;
    return;
  }

  tableBody.innerHTML = rows
    .map(r => {
      const color = window.TeamAssets.get(r.side).color;
      return `
        <tr>
          <td>${r.game}</td>
          <td>${r.book}</td>
          <td>${r.market} – ${r.side}</td>
          <td>${money(r.odds)}</td>
          <td><span class="badge-ev-pos">+${(r.edge * 100).toFixed(1)}%</span></td>
          <td>${r.kickoff}</td>
        </tr>
      `;
    })
    .join("");
}

// ------------------ Top 5 Card ------------------
function renderTop5(legs) {
  const sorted = legs.slice().sort((a, b) => b.edge - a.edge).slice(0, 5);

  if (!sorted.length) {
    topPanel.innerHTML = `<div class="muted">No edges yet.</div>`;
    return;
  }

  topPanel.innerHTML = sorted
    .map(l => {
      const pct = (l.edge * 100).toFixed(1);
      return `
        <div class="top5-item">
          <strong>${l.game}</strong><br>
          ${l.book} – ${l.market} ${l.side} ${money(l.odds)}
          <div class="badge-ev-pos">+${pct}% edge</div>
        </div>
      `;
    })
    .join("");
}

// ------------------ Parlay Builder ------------------
function buildParlays(legs) {
  const minEdge = parseFloat(minEdgeInput.value) || 0.02;

  const good = legs.filter(l => l.edge >= minEdge).slice(0, 8);
  if (!good.length) {
    parlayResults.innerHTML = `<div class="muted">No legs meet threshold.</div>`;
    return;
  }

  const cand2 = combos(good, 2);
  const cand3 = combos(good, 3);
  const all = [];

  function score(c) {
    let dec = 1;
    let fair = 1;
    c.forEach(l => {
      dec *= americanToDecimal(l.odds);
      fair *= l.fair;
    });
    const evUnit = dec * fair - 1;
    all.push({ c, dec, fair, evUnit });
  }

  cand2.forEach(score);
  cand3.forEach(score);

  all.sort((a, b) => b.evUnit - a.evUnit);

  const top = all.slice(0, 5);

  parlayResults.innerHTML = top
    .map(p => {
      return `
        <div class="parlay-card">
          <h4>${p.c.length}-Leg Parlay</h4>
          <ul>
            ${p.c
              .map(
                l => `
              <li>
                ${l.game} – <strong>${l.market} ${l.side}</strong>
                (${money(l.odds)}, +${(l.edge * 100).toFixed(1)}% edge)
              </li>`
              )
              .join("")}
          </ul>
          <div>Decimal: ${p.dec.toFixed(3)}</div>
          <div>Fair Prob: ${(p.fair * 100).toFixed(2)}%</div>
          <div class="badge-ev-pos">EV: ${(p.evUnit * 100).toFixed(2)}%</div>
        </div>
      `;
    })
    .join("");
}

// ------------------ Start ------------------
loadDashboard();
