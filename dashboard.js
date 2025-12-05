// ========================================================
//  EMPIREPICKS ANALYTICS DASHBOARD
//  - Uses same engine as main games view
//  - Top 5 edges + simple parlay EV builder
// ========================================================

import NFL_TEAMS from "./teams.js";
import { computeGameAnalytics } from "./script.js";

// ---------- DOM ----------
const tableBody        = document.querySelector("#dash tbody");
const topPanel         = document.querySelector("#top5");
const parlayResults    = document.querySelector("#parlayResults");
const parlayEdgeFilter = document.querySelector("#parlayEdgeFilter");

document.querySelector("#refresh").onclick          = loadDashboard;
document.querySelector("#generateParlays").onclick  = () => buildParlays(globalLegs);

// ---------- API ----------
async function getEvents() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to fetch events");
  return r.json();
}

async function getOdds() {
  const r = await fetch("/api/odds");
  if (!r.ok) throw new Error("Failed to fetch odds");
  return r.json();
}

// ---------- Helpers ----------
function prob(o) {
  return o > 0 ? 100 / (o + 100) : -o / (-o + 100);
}

function americanToDecimal(o) {
  return o > 0 ? 1 + o / 100 : 1 + 100 / -o;
}

function formatAmerican(o) {
  return o > 0 ? `+${o}` : `${o}`;
}

function avg(arr) {
  return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

// simple combinations helper for parlays
function combinations(arr, k) {
  const res = [];
  function backtrack(start, combo) {
    if (combo.length === k) {
      res.push(combo.slice());
      return;
    }
    for (let i = start; i < arr.length; i++) {
      combo.push(arr[i]);
      backtrack(i + 1, combo);
      combo.pop();
    }
  }
  backtrack(0, []);
  return res;
}

// ---------- State ----------
let globalLegs = []; // legs with best edges across games

// ========================================================
//  MAIN LOAD
// ========================================================
async function loadDashboard() {
  if (topPanel) {
    topPanel.innerHTML = `<div class="muted">Loading analytics...</div>`;
  }
  if (tableBody) {
    tableBody.innerHTML = `
      <tr><td colspan="7" class="muted">Loading NFL games and edges...</td></tr>
    `;
  }
  if (parlayResults) {
    parlayResults.innerHTML = "";
  }

  try {
    const [events, oddsWrap] = await Promise.all([getEvents(), getOdds()]);
    const odds = oddsWrap.data ?? oddsWrap;

    const oddsById = Object.fromEntries(odds.map(g => [g.id, g]));

    const now    = Date.now();
    const cutoff = 4 * 60 * 60 * 1000; // 4 hours after kickoff

    // Filter only active games within 4 hours after kickoff
    const activeEvents = events.filter(ev => {
      const g = oddsById[ev.id];
      if (!g) return false;
      const t = new Date(ev.commence_time).getTime();
      return now <= t + cutoff;
    });

    globalLegs = [];

    const rows = [];

    activeEvents.forEach(ev => {
      const gameOdds = oddsById[ev.id];
      if (!gameOdds || !gameOdds.bookmakers || !gameOdds.bookmakers.length) {
        return;
      }

      const ana = computeGameAnalytics(gameOdds, ev.away_team, ev.home_team);

      // compute best single edge for this game across all markets and books
      let bestLeg      = null;
      let bestEdge     = 0;
      let kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
        timeZone: "America/New_York",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit"
      });

      gameOdds.bookmakers.forEach(bm => {
        (bm.markets || []).forEach(m => {
          // ---------- Moneyline ----------
          if (m.key === "h2h") {
            const a = m.outcomes.find(o => o.name === ev.away_team);
            const h = m.outcomes.find(o => o.name === ev.home_team);
            if (a && h) {
              const pA = prob(a.price);
              const pH = prob(h.price);

              const edgeA = ana.nvAway - pA;
              const edgeH = ana.nvHome - pH;

              if (edgeA > bestEdge) {
                bestEdge = edgeA;
                bestLeg  = {
                  type: "Moneyline",
                  side: ev.away_team,
                  odds: a.price,
                  book: bm.title,
                  gameLabel: `${ev.away_team} @ ${ev.home_team}`,
                  kickoff: kickoffLocal,
                  implied: pA,
                  fair: ana.nvAway
                };
              }

              if (edgeH > bestEdge) {
                bestEdge = edgeH;
                bestLeg  = {
                  type: "Moneyline",
                  side: ev.home_team,
                  odds: h.price,
                  book: bm.title,
                  gameLabel: `${ev.away_team} @ ${ev.home_team}`,
                  kickoff: kickoffLocal,
                  implied: pH,
                  fair: ana.nvHome
                };
              }
            }
          }

          // ---------- Spreads ----------
          if (m.key === "spreads") {
            m.outcomes.forEach(o => {
              const implied = prob(o.price);

              // use bestSpreadProb as consensus probability for a spread outcome
              const spreadProb = ana.bestSpreadProb || 0;
              if (!spreadProb) return;

              const edge = spreadProb - implied;

              if (edge > bestEdge) {
                bestEdge = edge;
                bestLeg  = {
                  type: `Spread ${o.point}`,
                  side: o.name,
                  odds: o.price,
                  book: bm.title,
                  gameLabel: `${ev.away_team} @ ${ev.home_team}`,
                  kickoff: kickoffLocal,
                  implied,
                  fair: spreadProb
                };
              }
            });
          }

          // ---------- Totals ----------
          if (m.key === "totals") {
            m.outcomes.forEach(o => {
              const implied = prob(o.price);
              const totalProb = ana.bestTotalProb || 0;
              if (!totalProb) return;

              const edge = totalProb - implied;

              if (edge > bestEdge) {
                bestEdge = edge;
                bestLeg  = {
                  type: `Total ${o.name} ${o.point}`,
                  side: o.name,
                  odds: o.price,
                  book: bm.title,
                  gameLabel: `${ev.away_team} @ ${ev.home_team}`,
                  kickoff: kickoffLocal,
                  implied,
                  fair: totalProb
                };
              }
            });
          }
        });
      });

      if (bestLeg && bestEdge > 0) {
        bestLeg.edge       = bestEdge;
        bestLeg.away       = ev.away_team;
        bestLeg.home       = ev.home_team;
        bestLeg.favorite   = ana.winner;
        bestLeg.winProb    = ana.winnerProb;

        globalLegs.push(bestLeg);

        rows.push({
          game: bestLeg.gameLabel,
          kickoff: bestLeg.kickoff,
          favorite: bestLeg.favorite,
          winProb: bestLeg.winProb,
          book: bestLeg.book,
          market: bestLeg.type,
          side: bestLeg.side,
          odds: bestLeg.odds,
          edge: bestLeg.edge
        });
      }
    });

    // Sort rows by edge desc for table
    rows.sort((a, b) => b.edge - a.edge);

    renderTable(rows);
    renderTop5(globalLegs);

  } catch (err) {
    console.error(err);
    if (tableBody) {
      tableBody.innerHTML = `
        <tr><td colspan="7" class="error">
          Failed to load dashboard. Check API key, quota, or try again.
        </td></tr>
      `;
    }
    if (topPanel) {
      topPanel.innerHTML = `<div class="error">Analytics failed to load.</div>`;
    }
  }
}

// ========================================================
//  TABLE RENDER
// ========================================================
function renderTable(rows) {
  if (!tableBody) return;

  if (!rows.length) {
    tableBody.innerHTML = `
      <tr><td colspan="7" class="muted">
        No active games within the current window.
      </td></tr>
    `;
    return;
  }

  tableBody.innerHTML = rows
    .map(r => {
      const favPct  = (r.winProb * 100).toFixed(1);
      const edgePct = (r.edge * 100).toFixed(1);

      // team color chip from home team
      const homeTeam = NFL_TEAMS[r.favorite || r.home] || NFL_TEAMS[r.home] || null;
      const chip = homeTeam
        ? `<span class="team-chip"
                 style="display:inline-block;width:10px;height:10px;border-radius:50%;
                        background:${homeTeam.primary};margin-right:4px;"></span>`
        : "";

      return `
        <tr>
          <td>
            <div class="team-cell">
              <div>
                <div>${r.game}</div>
                <small class="muted">${r.kickoff}</small>
              </div>
            </div>
          </td>
          <td>
            ${chip}
            <strong>${r.favorite}</strong><br>
            <small class="muted">${favPct}% win</small>
          </td>
          <td>
            ${r.book}
          </td>
          <td>
            ${r.market}<br>
            <small>${r.side}</small>
          </td>
          <td>
            ${formatAmerican(r.odds)}
          </td>
          <td>
            <span class="badge-ev-pos">
              +${edgePct}%
            </span>
          </td>
        </tr>
      `;
    })
    .join("");
}

// ========================================================
//  TOP 5 EDGES PANEL
// ========================================================
function renderTop5(legs) {
  if (!topPanel) return;

  if (!legs.length) {
    topPanel.innerHTML = `<div class="muted">No edges available yet.</div>`;
    return;
  }

  const sorted = legs.slice().sort((a, b) => b.edge - a.edge).slice(0, 5);

  topPanel.innerHTML = `
    <h2 style="margin-bottom:0.5rem;">Top 5 Edges This Week</h2>
    <div class="muted" style="margin-bottom:0.75rem;font-size:0.9rem;">
      Based on no-vig probabilities versus current bookmaker prices.
    </div>
    <ul class="edge-list">
      ${sorted
        .map(l => {
          const edgePct = (l.edge * 100).toFixed(1);
          const winPct  = (l.fair * 100).toFixed(1);
          return `
            <li class="edge-item">
              <div>
                <strong>${l.gameLabel}</strong><br>
                <span>${l.book}</span> - ${l.type} - ${l.side} ${formatAmerican(l.odds)}
              </div>
              <div style="text-align:right;">
                <div><span class="badge-ev-pos">Edge +${edgePct}%</span></div>
                <small class="muted">True win roughly ${winPct}%</small>
              </div>
            </li>
          `;
        })
        .join("")}
    </ul>
  `;
}

// ========================================================
//  PARLAY EV BUILDER (SIMPLE)
// ========================================================
function buildParlays(legs) {
  if (!parlayResults) return;

  if (!legs || !legs.length) {
    parlayResults.innerHTML = `<div class="muted">No legs available for parlays yet.</div>`;
    return;
  }

  let minEdge = 0.02; // default 2 percent
  if (parlayEdgeFilter && parlayEdgeFilter.value) {
    const parsed = parseFloat(parlayEdgeFilter.value);
    if (!Number.isNaN(parsed)) minEdge = parsed;
  }

  const candidates = legs.filter(l => l.edge >= minEdge).sort((a, b) => b.edge - a.edge);

  if (!candidates.length) {
    parlayResults.innerHTML = `<div class="muted">
      No legs meet the selected minimum edge threshold.
    </div>`;
    return;
  }

  // Take top 6 legs to keep combinations reasonable
  const top = candidates.slice(0, 6);

  const combos2 = combinations(top, 2);
  const combos3 = combinations(top, 3);

  const scored = [];

  function scoreCombo(combo) {
    let decOdds = 1;
    let impliedParlay = 1;
    let fairParlay    = 1;

    combo.forEach(l => {
      const d  = americanToDecimal(l.odds);
      const ip = l.implied ?? prob(l.odds);
      const fp = l.fair ?? Math.min(Math.max(ip + l.edge, 0.01), 0.99);

      decOdds       *= d;
      impliedParlay *= ip;
      fairParlay    *= fp;
    });

    const evEdge = fairParlay - impliedParlay;
    const evUnit = decOdds * fairParlay - 1; // expected profit per 1 unit stake

    scored.push({
      legs: combo,
      decOdds,
      impliedParlay,
      fairParlay,
      evEdge,
      evUnit
    });
  }

  combos2.forEach(scoreCombo);
  combos3.forEach(scoreCombo);

  scored.sort((a, b) => b.evUnit - a.evUnit);

  const topParlays = scored.slice(0, 5);

  if (!topParlays.length) {
    parlayResults.innerHTML = `<div class="muted">No profitable parlays found.</div>`;
    return;
  }

  parlayResults.innerHTML = topParlays
    .map(p => renderParlayCard(p))
    .join("");
}

function renderParlayCard(p) {
  const dec = p.decOdds.toFixed(3);
  const impliedPct = (p.impliedParlay * 100).toFixed(2);
  const fairPct    = (p.fairParlay * 100).toFixed(2);
  const edgePct    = (p.evEdge * 100).toFixed(2);
  const evUnitPct  = (p.evUnit * 100).toFixed(2);

  const legsHtml = p.legs
    .map(
      l => `
    <li>
      <strong>${l.gameLabel}</strong><br>
      ${l.book} - ${l.type} - ${l.side} ${formatAmerican(l.odds)}
      <small class="muted">
        (Edge ${(l.edge * 100).toFixed(1)}%)
      </small>
    </li>
  `
    )
    .join("");

  return `
    <div class="parlay-card">
      <h3>Parlay (${p.legs.length} legs)</h3>
      <ul>${legsHtml}</ul>
      <div style="margin-top:6px;">
        <div><strong>Decimal Odds:</strong> ${dec}</div>
        <div><strong>Market Implied Prob:</strong> ${impliedPct}%</div>
        <div><strong>Model Fair Prob:</strong> ${fairPct}%</div>
        <div>
          <strong>Parlay Edge:</strong>
          <span class="${p.evEdge >= 0 ? "badge-ev-pos" : "badge-ev-neg"}">
            ${edgePct}%
          </span>
        </div>
        <div>
          <strong>Expected Value (per 1u):</strong>
          <span class="${p.evUnit >= 0 ? "badge-ev-pos" : "badge-ev-neg"}">
            ${evUnitPct}%
          </span>
        </div>
      </div>
    </div>
  `;
}

// ========================================================
//  BOOT
// ========================================================
loadDashboard();
