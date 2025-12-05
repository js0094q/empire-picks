// dashboard.js — analytics + parlay EV, uses window.Empire

(function () {
  const dashBody = document.getElementById("dash-body");
  const top5El = document.getElementById("top5");
  const refreshBtn = document.getElementById("refresh");
  const edgeInput = document.getElementById("parlayEdgeFilter");
  const genBtn = document.getElementById("generateParlays");
  const parlayResults = document.getElementById("parlayResults");

  if (!dashBody || !top5El) return; // not on dashboard page

  const { computeGameAnalytics, apiGET, money, prob } = window.Empire;

  const americanToDecimal = o => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

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

  let globalLegs = [];

  async function loadDashboard() {
    dashBody.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    top5El.innerHTML = `<div class="muted">Loading…</div>`;
    parlayResults.innerHTML = "";

    try {
      const events = await apiGET("/api/events");
      const oddsWrap = await apiGET("/api/odds");
      const odds = oddsWrap.data ?? oddsWrap;
      const byId = Object.fromEntries(odds.map(g => [g.id, g]));

      const now = Date.now();
      const cutoff = 4 * 60 * 60 * 1000;

      const active = events.filter(ev => {
        const g = byId[ev.id];
        if (!g) return false;
        const t = new Date(ev.commence_time).getTime();
        return now <= t + cutoff;
      });

      globalLegs = [];
      const rows = [];

      active.forEach(ev => {
        const game = byId[ev.id];
        if (!game) return;

        const ana = computeGameAnalytics(game, ev.away_team, ev.home_team);
        const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
          timeZone: "America/New_York",
          hour: "numeric",
          minute: "2-digit",
          month: "short",
          day: "numeric"
        });

        let best = null;
        let bestEdge = 0;

        (game.bookmakers || []).forEach(bm => {
          (bm.markets || []).forEach(m => {
            if (m.key === "h2h") {
              const a = m.outcomes.find(o => o.name === ev.away_team);
              const h = m.outcomes.find(o => o.name === ev.home_team);
              if (!a || !h) return;

              const edgeA = ana.nvA - prob(a.price);
              const edgeH = ana.nvH - prob(h.price);

              if (edgeA > bestEdge) {
                bestEdge = edgeA;
                best = {
                  game: `${ev.away_team} @ ${ev.home_team}`,
                  market: "ML",
                  side: ev.away_team,
                  odds: a.price,
                  book: bm.title,
                  kickoff: kickoffLocal,
                  edge: edgeA,
                  fair: ana.nvA
                };
              }
              if (edgeH > bestEdge) {
                bestEdge = edgeH;
                best = {
                  game: `${ev.away_team} @ ${ev.home_team}`,
                  market: "ML",
                  side: ev.home_team,
                  odds: h.price,
                  book: bm.title,
                  kickoff: kickoffLocal,
                  edge: edgeH,
                  fair: ana.nvH
                };
              }
            }
          });
        });

        if (best) {
          globalLegs.push(best);
          rows.push(best);
        }
      });

      rows.sort((a, b) => b.edge - a.edge);

      if (!rows.length) {
        dashBody.innerHTML = `<tr><td colspan="6" class="muted">No active games.</td></tr>`;
      } else {
        dashBody.innerHTML = rows
          .map(
            r => `
          <tr>
            <td>${r.game}</td>
            <td>${r.book}</td>
            <td>${r.market} ${r.side}</td>
            <td>${money(r.odds)}</td>
            <td><span class="badge-ev-pos">+${(r.edge * 100).toFixed(1)}%</span></td>
            <td>${r.kickoff}</td>
          </tr>`
          )
          .join("");
      }

      renderTop5(globalLegs);
    } catch (err) {
      console.error(err);
      dashBody.innerHTML = `<tr><td colspan="6" class="error">Failed to load dashboard.</td></tr>`;
      top5El.innerHTML = `<div class="error">Error loading edges.</div>`;
    }
  }

  function renderTop5(legs) {
    if (!legs.length) {
      top5El.innerHTML = `<div class="muted">No edges available.</div>`;
      return;
    }
    const top = legs.slice().sort((a, b) => b.edge - a.edge).slice(0, 5);
    top5El.innerHTML = top
      .map(
        l => `
      <div class="top5-item">
        <div><strong>${l.game}</strong></div>
        <div>${l.book} – ${l.market} ${l.side} ${money(l.odds)}</div>
        <div class="badge-ev-pos">+${(l.edge * 100).toFixed(1)}% edge</div>
      </div>`
      )
      .join("");
  }

  function buildParlays(legs) {
    if (!parlayResults) return;
    parlayResults.innerHTML = "";

    if (!legs.length) {
      parlayResults.innerHTML = `<div class="muted">No legs available.</div>`;
      return;
    }

    const minEdge = parseFloat(edgeInput.value) || 0.02;
    const candidates = legs.filter(l => l.edge >= minEdge).slice(0, 8);

    if (!candidates.length) {
      parlayResults.innerHTML = `<div class="muted">No legs meet edge threshold.</div>`;
      return;
    }

    const combos2 = combinations(candidates, 2);
    const combos3 = combinations(candidates, 3);
    const scored = [];

    function score(combo) {
      let dec = 1;
      let fair = 1;
      combo.forEach(l => {
        dec *= americanToDecimal(l.odds);
        fair *= l.fair;
      });
      const ev = dec * fair - 1;
      scored.push({ combo, dec, fair, ev });
    }

    combos2.forEach(score);
    combos3.forEach(score);

    scored.sort((a, b) => b.ev - a.ev);
    const top = scored.slice(0, 5);

    if (!top.length) {
      parlayResults.innerHTML = `<div class="muted">No +EV parlays identified.</div>`;
      return;
    }

    parlayResults.innerHTML = top
      .map(p => {
        const legsHtml = p.combo
          .map(
            l =>
              `<li>${l.game} – <strong>${l.market} ${l.side}</strong> ${money(
                l.odds
              )} (edge ${(l.edge * 100).toFixed(1)}%)</li>`
          )
          .join("");
        return `
        <div class="parlay-card">
          <h3>${p.combo.length}-Leg Parlay</h3>
          <ul>${legsHtml}</ul>
          <div>Decimal odds: ${p.dec.toFixed(3)}</div>
          <div>Fair prob: ${(p.fair * 100).toFixed(2)}%</div>
          <div class="badge-ev-pos">EV: ${(p.ev * 100).toFixed(2)}%</div>
        </div>`;
      })
      .join("");
  }

  refreshBtn.onclick = loadDashboard;
  genBtn.onclick = () => buildParlays(globalLegs);

  loadDashboard();
})();
