// script.js — core UI logic: load games, odds, render cards with ML, Spread, Total + probabilities + EV + props (top 10)

const API_KEY = 'YOUR_ODDS_API_KEY_HERE';
const SPORT = 'americanfootball_nfl';
const REGIONS = 'us';
const MARKETS = ['h2h','spreads','totals'];

const gamesContainer = document.getElementById('games-container');
const navLive = document.getElementById('nav-live');
const navDashboard = document.getElementById('nav-dashboard');
const liveSection = document.getElementById('live-games');
const dashboardSection = document.getElementById('dashboard');

navLive.addEventListener('click', () => {
  navLive.classList.add('active');
  navDashboard.classList.remove('active');
  liveSection.classList.remove('hidden');
  dashboardSection.classList.add('hidden');
});
navDashboard.addEventListener('click', () => {
  navDashboard.classList.add('active');
  navLive.classList.remove('active');
  dashboardSection.classList.remove('hidden');
  liveSection.classList.add('hidden');
});

async function fetchOdds() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS.join(',')}`;
  const resp = await fetch(url);
  return resp.json();
}

async function loadGames() {
  try {
    const data = await fetchOdds();
    gamesContainer.innerHTML = '';
    data.forEach(game => {
      const analytics = computeAnalytics(game);
      const card = buildGameCard(game, analytics);
      gamesContainer.appendChild(card);
    });
  } catch (e) {
    console.error('Error fetching odds', e);
  }
}

function prob(odds) {
  // American odds
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}
function money(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function computeAnalytics(game) {
  // remove vig — simplistic proportional method
  // assumes two-way market (ML); for more complex markets may need more advanced vig-removal
  let away = null, home = null;
  let bestSpread = null, bestSpreadProb = 0;
  let bestTotalProb = 0;

  game.bookmakers.forEach(bm => {
    bm.markets.forEach(m => {
      if (m.key === 'h2h') {
        m.outcomes.forEach(o => {
          if (!away && o.name === game.teams[0]) away = o.price;
          if (!home && o.name === game.teams[1]) home = o.price;
        });
      }
      if (m.key === 'spreads') {
        m.outcomes.forEach(o => {
          const p = prob(o.price);
          if (p > bestSpreadProb) {
            bestSpreadProb = p;
            bestSpread = o;
          }
        });
      }
      if (m.key === 'totals') {
        m.outcomes.forEach(o => {
          const p = prob(o.price);
          if (p > bestTotalProb) {
            bestTotalProb = p;
          }
        });
      }
    });
  });

  // no-vig baseline on ML
  let impliedAway = prob(away);
  let impliedHome = prob(home);
  const sum = impliedAway + impliedHome;
  const nvAway = impliedAway / sum;
  const nvHome = impliedHome / sum;

  return {
    away: game.teams[0],
    home: game.teams[1],
    awayPrice: away,
    homePrice: home,
    nvAway,
    nvHome,
    bestSpread,
    bestSpreadProb,
    bestTotalProb
  };
}

function buildGameCard(game, analytics) {
  const card = document.createElement('div');
  card.className = 'game-card';

  const hdr = document.createElement('div');
  hdr.className = 'game-header';
  hdr.innerHTML = `
    <div class="teams">${analytics.away} @ ${analytics.home}</div>
    <div class="start-time">${new Date(game.commence_time).toLocaleString()}</div>
  `;

  const body = document.createElement('div');
  body.className = 'game-body';

  const tableWrapper = document.createElement('div');
  renderLines(tableWrapper, game, analytics);
  body.appendChild(tableWrapper);

  card.appendChild(hdr);
  card.appendChild(body);
  return card;
}

function renderLines(container, game, analytics) {
  const rows = [];

  (game.bookmakers || []).forEach(bm => {
    const rec = {
      book: bm.title,
      moneyline: "–",
      moneylineProb: "",
      spread: "–",
      spreadProb: "",
      total: "–",
      totalProb: "",
      edge: null
    };

    let rowEdge = null;

    (bm.markets || []).forEach(m => {
      // MONEYLINE
      if (m.key === "h2h") {
        const a = m.outcomes.find(o => o.name === analytics.away);
        const h = m.outcomes.find(o => o.name === analytics.home);

        if (a && h) {
          rec.moneyline = `${money(a.price)} / ${money(h.price)}`;
          rec.moneylineProb =
            `${analytics.away}: ${(analytics.nvAway * 100).toFixed(1)}% • ` +
            `${analytics.home}: ${(analytics.nvHome * 100).toFixed(1)}%`;

          const impliedA = prob(a.price);
          const impliedH = prob(h.price);
          rowEdge = Math.max(
            analytics.nvAway - impliedA,
            analytics.nvHome - impliedH
          );
        }
      }

      // SPREAD
      if (m.key === "spreads") {
        const best = analytics.bestSpread;
        if (best) {
          rec.spread = `${best.name} ${best.point} (${money(best.price)})`;
          rec.spreadProb = `~${(analytics.bestSpreadProb * 100).toFixed(1)}%`;
        }
      }

      // TOTALS
      if (m.key === "totals") {
        const over = m.outcomes.find(o => o.name.toLowerCase() === "over");
        const under = m.outcomes.find(o => o.name.toLowerCase() === "under");
        if (over && under) {
          rec.total = `O${over.point} / U${under.point}`;
          rec.totalProb = `O ${(analytics.bestTotalProb * 100).toFixed(1)}%`;
        }
      }
    });

    rec.edge = rowEdge;
    rows.push(rec);
  });

  let bestIndex = -1;
  let bestEdge = 0;
  rows.forEach((r, i) => {
    if (typeof r.edge === "number" && r.edge > bestEdge + 0.01) {
      bestEdge = r.edge;
      bestIndex = i;
    }
  });

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Book</th>
          <th>ML</th>
          <th>Prob</th>
          <th>Spread</th>
          <th>Prob</th>
          <th>Total</th>
          <th>Prob</th>
          <th>Edge</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r, i) => `
          <tr>
            <td>${r.book}</td>
            <td>${r.moneyline}</td>
            <td>${r.moneylineProb}</td>
            <td>${r.spread}</td>
            <td>${r.spreadProb}</td>
            <td>${r.total}</td>
            <td>${r.totalProb}</td>
            <td>
              ${
                typeof r.edge === "number"
                  ? `${(r.edge * 100).toFixed(1)}%`
                  : ""
              }
              ${
                i === bestIndex && bestEdge > 0.01
                  ? `<span class="ev-pos">⭐ Best</span>`
                  : ""
              }
            </td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

loadGames();
setInterval(loadGames, 5 * 60 * 1000);   // refresh every 5 minutes
