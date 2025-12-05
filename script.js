// script.js — main games engine (index + props)

(function () {
  const gamesContainer =
    document.getElementById("games-container") ||
    document.getElementById("events-container");

  // ---------- Helpers ----------
  const money = o => (o > 0 ? `+${o}` : `${o}`);
  const prob = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  const avg = arr =>
    arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const noVig = (p1, p2) => {
    const t = p1 + p2;
    return t ? [p1 / t, p2 / t] : [0.5, 0.5];
  };

  async function apiGET(url) {
    const r = await fetch(url);
    if (!r.ok) throw new Error(`API FAILED ${url} status=${r.status}`);
    return r.json();
  }

  // ---------- Analytics ----------
  function computeGameAnalytics(game, away, home) {
    const books = game.bookmakers || [];
    const pa = [];
    const ph = [];

    books.forEach(b => {
      (b.markets || []).forEach(m => {
        if (m.key === "h2h") {
          const a = m.outcomes.find(o => o.name === away);
          const h = m.outcomes.find(o => o.name === home);
          if (a && h) {
            pa.push(prob(a.price));
            ph.push(prob(h.price));
          }
        }
      });
    });

    const avgA = avg(pa);
    const avgH = avg(ph);
    const [nvA, nvH] = noVig(avgA, avgH);

    const winner = nvA > nvH ? away : home;
    const winnerProb = Math.max(nvA, nvH);

    return { away, home, nvA, nvH, winner, winnerProb };
  }

  // ---------- Card UI ----------
  function buildCard(ev, game) {
    const card = document.createElement("div");
    card.className = "game-card";

    const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
      timeZone: "America/New_York",
      hour: "numeric",
      minute: "2-digit",
      month: "short",
      day: "numeric"
    });

    const away = window.TeamAssets.get(ev.away_team);
    const home = window.TeamAssets.get(ev.home_team);
    const ana = computeGameAnalytics(game, ev.away_team, ev.home_team);

    card.innerHTML = `
      <header class="game-header" style="border-color:${home.primary}">
        <div class="team-row">
          <img class="team-logo" src="${away.logoUrl}"/>
          <div class="teams">
            <div>${ev.away_team} @ ${ev.home_team}</div>
            <div class="kickoff">Kickoff: ${kickoffLocal}</div>
          </div>
          <img class="team-logo" src="${home.logoUrl}"/>
        </div>
        <div class="forecast">
          Market leans <strong>${ana.winner}</strong>
          (${(ana.winnerProb * 100).toFixed(1)}% win)
        </div>
      </header>

      <div class="accordion">
        <button class="accordion-toggle">View Lines & Props</button>
        <div class="accordion-body">
          <div class="tabs">
            <button class="tab active" data-tab="lines">Lines</button>
            <button class="tab" data-tab="props">Props</button>
          </div>
          <div class="tab-pane active" data-pane="lines">
            <div class="loader">Loading lines…</div>
          </div>
          <div class="tab-pane" data-pane="props">
            <em>Click "Props" to load</em>
          </div>
        </div>
      </div>
    `;

    // Accordion
    const accToggle = card.querySelector(".accordion-toggle");
    const accBody = card.querySelector(".accordion-body");
    accToggle.onclick = () => {
      accBody.classList.toggle("open");
    };

    // Lines
    const linesPane = card.querySelector('[data-pane="lines"]');
    renderLines(linesPane, game, ev, ana);

    // Tabs
    const propsPane = card.querySelector('[data-pane="props"]');
    card.querySelectorAll(".tab").forEach(btn => {
      btn.onclick = () => {
        card.querySelectorAll(".tab").forEach(b => b.classList.remove("active"));
        card
          .querySelectorAll(".tab-pane")
          .forEach(p => p.classList.remove("active"));
        btn.classList.add("active");
        const target = btn.dataset.tab;
        card
          .querySelector(`[data-pane="${target}"]`)
          .classList.add("active");

        if (target === "props" && !propsPane.dataset.loaded) {
          loadProps(ev.id, propsPane);
        }
      };
    });

    return card;
  }

  function renderLines(pane, game, ev, ana) {
    const rows = [];

    (game.bookmakers || []).forEach(bm => {
      const row = { book: bm.title, ml: "-", spread: "-", total: "-" };

      (bm.markets || []).forEach(m => {
        if (m.key === "h2h") {
          const a = m.outcomes.find(o => o.name === ev.away_team);
          const h = m.outcomes.find(o => o.name === ev.home_team);
          if (a && h) {
            row.ml = `${money(a.price)} / ${money(h.price)}`;
          }
        }
        if (m.key === "spreads") {
          const best = m.outcomes
            .slice()
            .sort((x, y) => Math.abs(x.point) - Math.abs(y.point))[0];
          if (best) {
            row.spread = `${best.name} ${best.point} (${money(best.price)})`;
          }
        }
        if (m.key === "totals") {
          const over = m.outcomes.find(o => o.name.toLowerCase() === "over");
          const under = m.outcomes.find(o => o.name.toLowerCase() === "under");
          if (over && under) {
            row.total = `O${over.point} / U${under.point}`;
          }
        }
      });

      rows.push(row);
    });

    pane.innerHTML = `
      <table class="table">
        <thead>
          <tr><th>Book</th><th>Moneyline</th><th>Spread</th><th>Total</th><th>Add</th></tr>
        </thead>
        <tbody>
          ${rows
            .map(
              r => `
            <tr>
              <td>${r.book}</td>
              <td>${r.ml}</td>
              <td>${r.spread}</td>
              <td>${r.total}</td>
              <td><button class="button tiny add-leg-btn">+</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
    `;

    pane.querySelectorAll(".add-leg-btn").forEach((btn, idx) => {
      btn.onclick = () => {
        const r = rows[idx];
        if (!window.Parlay) return;
        window.Parlay.addLeg({
          game: `${ev.away_team} @ ${ev.home_team}`,
          label: `${r.book} line`,
          odds: r.ml
        });
      };
    });
  }

  async function loadProps(eventId, pane) {
    pane.dataset.loaded = "1";
    pane.innerHTML = `<div class="loader">Loading props…</div>`;

    try {
      const data = await apiGET(`/api/event-odds?eventId=${encodeURIComponent(eventId)}`);
      const game = Array.isArray(data) ? data[0] : data;

      if (!game || !game.bookmakers || !game.bookmakers.length) {
        pane.innerHTML = `<div class="muted">No props available.</div>`;
        return;
      }

      const rows = [];
      game.bookmakers.forEach(bm => {
        (bm.markets || []).forEach(m => {
          (m.outcomes || []).forEach(o => {
            rows.push({
              book: bm.title,
              market: m.key,
              player: o.description || "-",
              pick: o.name,
              line: o.point ?? "-",
              odds: money(o.price)
            });
          });
        });
      });

      if (!rows.length) {
        pane.innerHTML = `<div class="muted">No props available.</div>`;
        return;
      }

      pane.innerHTML = `
        <table class="table">
          <thead>
            <tr>
              <th>Book</th>
              <th>Market</th>
              <th>Player</th>
              <th>Pick</th>
              <th>Line</th>
              <th>Odds</th>
            </tr>
          </thead>
          <tbody>
            ${rows
              .slice(0, 80)
              .map(
                r => `
              <tr>
                <td>${r.book}</td>
                <td>${r.market}</td>
                <td>${r.player}</td>
                <td>${r.pick}</td>
                <td>${r.line}</td>
                <td>${r.odds}</td>
              </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
    } catch (err) {
      console.error(err);
      pane.innerHTML = `<div class="error">Failed to load props.</div>`;
    }
  }

  // ---------- Main load ----------
  async function loadGames() {
    if (!gamesContainer) return;

    gamesContainer.innerHTML = `<div class="loader">Loading NFL games...</div>`;

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

      if (!active.length) {
        gamesContainer.innerHTML = `<div class="muted">No active games in this window.</div>`;
        return;
      }

      gamesContainer.innerHTML = "";
      active.forEach(ev => {
        const game = byId[ev.id];
        const card = buildCard(ev, game);
        gamesContainer.appendChild(card);
      });
    } catch (e) {
      console.error(e);
      gamesContainer.innerHTML = `<div class="error">Failed to load NFL data.</div>`;
    }
  }

  if (gamesContainer) {
    loadGames();
  }

  // expose for dashboard.js
  window.Empire = {
    money,
    prob,
    computeGameAnalytics,
    apiGET
  };
})();
