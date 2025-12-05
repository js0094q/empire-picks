// =============================================================
//  EMPIREPICKS – SCRIPT.JS
//  Main games loader, card builder, EV engine, props loader
//  Uses TeamAssets global + Auth global
// =============================================================

// ------------------ DOM ------------------
const eventsContainer = document.getElementById("events-container");

// ------------------ Helpers ------------------
const money = o => (o > 0 ? `+${o}` : `${o}`);

function prob(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function avg(arr) {
  return arr && arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function noVig(p1, p2) {
  const t = p1 + p2;
  return t ? [p1 / t, p2 / t] : [0.5, 0.5];
}

function groupByPoint(arr) {
  const out = {};
  arr.forEach(o => {
    const k = `${o.name}:${o.point}`;
    if (!out[k]) out[k] = [];
    out[k].push(prob(o.price));
  });
  return out;
}

// ------------------ API ------------------
async function apiGET(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`API FAILED ${url}`);
  return r.json();
}

// ------------------ Main load ------------------
async function loadEvents() {
  eventsContainer.innerHTML = `<div class="loader">Loading NFL games...</div>`;

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

    eventsContainer.innerHTML = "";

    active.forEach(ev => {
      const card = buildGameCard(ev, map[ev.id]);
      eventsContainer.appendChild(card);
    });
  } catch (e) {
    console.error(e);
    eventsContainer.innerHTML = `<div class="error">Failed loading games.</div>`;
  }
}

// =============================================================
//  CARD BUILDER
// =============================================================
function buildGameCard(ev, game) {
  const card = document.createElement("div");
  card.className = "game-card";

  const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
    timeZone: "America/New_York",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    day: "numeric"
  });

  const awayT = window.TeamAssets.get(ev.away_team);
  const homeT = window.TeamAssets.get(ev.home_team);

  // Run analytics
  const analytics = computeGameAnalytics(game, ev.away_team, ev.home_team);

  card.innerHTML = `
    <div class="game-header" style="border-color:${homeT.color}">
      <div class="team-row">
        <img src="${awayT.logoUrl}" class="team-logo">
        <span>${ev.away_team} @ ${ev.home_team}</span>
        <img src="${homeT.logoUrl}" class="team-logo">
      </div>
      <div class="kickoff">Kickoff: ${kickoffLocal}</div>
      <div class="forecast">
        <span>Favored: <strong>${analytics.winner}</strong>
        (${(analytics.winnerProb * 100).toFixed(1)}%)</span>
      </div>
    </div>

    <div class="tabs">
      <button class="tab active" data-tab="lines">Lines</button>
      <button class="tab" data-tab="props">Props</button>
    </div>

    <div class="tab-pane active" id="lines"></div>
    <div class="tab-pane" id="props"><em>Click to load props</em></div>
  `;

  renderLines(card.querySelector("#lines"), game, analytics, ev);

  // Tabs
  card.querySelectorAll(".tab").forEach(btn => {
    btn.addEventListener("click", () => {
      card.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
      card.querySelectorAll(".tab-pane").forEach(p =>
        p.classList.remove("active")
      );

      btn.classList.add("active");
      const pane = card.querySelector(`#${btn.dataset.tab}`);
      pane.classList.add("active");

      if (btn.dataset.tab === "props" && !pane.dataset.loaded) {
        loadProps(ev.id, pane);
      }
    });
  });

  return card;
}

// =============================================================
//  GAME ANALYTICS ENGINE
// =============================================================
function computeGameAnalytics(game, away, home) {
  const books = game.bookmakers || [];

  const mlAway = [];
  const mlHome = [];

  const spreads = [];
  const totals = [];

  books.forEach(b => {
    (b.markets || []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === away);
        const h = m.outcomes.find(o => o.name === home);
        if (a && h) {
          mlAway.push(prob(a.price));
          mlHome.push(prob(h.price));
        }
      }
      if (m.key === "spreads") spreads.push(...m.outcomes);
      if (m.key === "totals") totals.push(...m.outcomes);
    });
  });

  const avgA = avg(mlAway);
  const avgH = avg(mlHome);
  const [nvA, nvH] = noVig(avgA, avgH);

  const winner = nvA > nvH ? away : home;
  const winnerProb = Math.max(nvA, nvH);

  return { away, home, nvA, nvH, winner, winnerProb };
}

// =============================================================
//  LINES PANEL
// =============================================================
function renderLines(el, game, analytics, ev) {
  const rows = [];

  game.bookmakers.forEach(bm => {
    const row = { book: bm.title, moneyline: "-", spread: "-", total: "-" };

    (bm.markets || []).forEach(m => {
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === ev.away_team);
        const h = m.outcomes.find(o => o.name === ev.home_team);
        if (a && h) {
          row.moneyline = `${money(a.price)} / ${money(h.price)}`;
        }
      }

      if (m.key === "spreads") {
        const best = m.outcomes.sort((x, y) => Math.abs(x.point) - Math.abs(y.point))[0];
        if (best) {
          row.spread = `${best.name} ${best.point} (${money(best.price)})`;
        }
      }

      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name === "Over");
        const under = m.outcomes.find(o => o.name === "Under");
        if (over && under) {
          row.total = `O${over.point} / U${under.point}`;
        }
      }
    });

    rows.push(row);
  });

  el.innerHTML = `
    <table class="table">
      <thead>
        <tr><th>Book</th><th>ML</th><th>Spread</th><th>Total</th></tr>
      </thead>
      <tbody>
        ${rows
          .map(
            r => `
          <tr>
            <td>${r.book}</td>
            <td>${r.moneyline}</td>
            <td>${r.spread}</td>
            <td>${r.total}</td>
          </tr>`
          )
          .join("")}
      </tbody>
    </table>
  `;
}

// =============================================================
//  PROPS PANEL
// =============================================================
async function loadProps(eventId, pane) {
  pane.dataset.loaded = "1";
  pane.innerHTML = `<div class="loader">Loading props...</div>`;

  try {
    const wrap = await apiGET(`/api/event-odds?eventId=${eventId}`);
    const props = wrap.props ?? wrap;

    if (!props.bookmakers) {
      pane.innerHTML = `<div class="muted">No props available.</div>`;
      return;
    }

    const sections = [];

    props.bookmakers.forEach(bm => {
      (bm.markets || []).forEach(m => {
        const group = m.key;
        const list = m.outcomes
          .map(
            o => `
          <tr>
            <td>${bm.title}</td>
            <td>${o.description || "-"}</td>
            <td>${o.name}</td>
            <td>${o.point ?? "-"}</td>
            <td>${money(o.price)}</td>
          </tr>`
          )
          .join("");

        if (list.length) {
          sections.push(`
            <h4>${group}</h4>
            <table class="table">
              <thead>
                <tr><th>Book</th><th>Player</th><th>Pick</th><th>Line</th><th>Odds</th></tr>
              </thead>
              <tbody>${list}</tbody>
            </table>
          `);
        }
      });
    });

    pane.innerHTML = sections.join("<br/>");
  } catch (e) {
    console.error(e);
    pane.innerHTML = `<div class="error">Failed loading props.</div>`;
  }
}

// ------------------ Start ------------------
loadEvents();
