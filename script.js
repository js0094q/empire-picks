// script.js — core UI logic: load games, odds, render cards with ML, Spread, Total + probabilities + EV + props (top 10)

const API_KEY = 'YOUR_ODDS_API_KEY_HERE';  // ← replace with your actual key
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

function impliedProbFromAmerican(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

function computeEV(winProb, odds, stake = 1) {
  const impProb = impliedProbFromAmerican(odds);
  const payout = odds > 0 ? (odds / 100) * stake : (100 / Math.abs(odds)) * stake;
  const profitIfWin = payout;
  const lossIfLose = stake;
  const ev = (winProb * profitIfWin) - ((1 - winProb) * lossIfLose);
  const edge = ev / stake;
  return { ev, edge, impliedProb: impProb };
}

function money(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

function computeAnalytics(game) {
  let away = null, home = null;
  let bestSpread = null, bestSpreadProb = 0;
  let bestTotal = null, bestTotalProb = 0;

  (game.bookmakers || []).forEach(bm => {
    bm.markets.forEach(m => {
      if (m.key === 'h2h') {
        m.outcomes.forEach(o => {
          if (!away && o.name === game.teams[0]) away = o.price;
          if (!home && o.name === game.teams[1]) home = o.price;
        });
      }
      if (m.key === 'spreads') {
        m.outcomes.forEach(o => {
          const p = impliedProbFromAmerican(o.price);
          if (p > bestSpreadProb) {
            bestSpreadProb = p;
            bestSpread = o;
          }
        });
      }
      if (m.key === 'totals') {
        m.outcomes.forEach(o => {
          const p = impliedProbFromAmerican(o.price);
          if (p > bestTotalProb) {
            bestTotalProb = p;
            bestTotal = o;
          }
        });
      }
    });
  });

  const impliedAway = impliedProbFromAmerican(away);
  const impliedHome = impliedProbFromAmerican(home);
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
    bestTotal,
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
      mlOdds: "-", mlImp: "", mlModel: "", mlEdge: "",
      spreadLine: "-", spreadImp: "", spreadModel: "", spreadEdge: "",
      totalLine: "-", totalImp: "", totalModel: "", totalEdge: ""
    };

    bm.markets.forEach(m => {
      if (m.key === 'h2h') {
        const a = m.outcomes.find(o => o.name === analytics.away);
        const h = m.outcomes.find(o => o.name === analytics.home);
        if (a && h) {
          rec.mlOdds = `${money(a.price)} / ${money(h.price)}`;

          // Away
          const { impliedProb: impA } = computeEV(0, a.price);
          const evA = computeEV(analytics.nvAway, a.price);
          rec.mlImp = `Imp: ${(impA * 100).toFixed(1)}%`;
          rec.mlModel = `${analytics.away}: ${(analytics.nvAway * 100).toFixed(1)}%`;
          rec.mlEdge = `${(evA.edge * 100).toFixed(1)}%`;

          // Could optionally show home side too by additional row or in same cell
        }
      }

      if (m.key === 'spreads' && analytics.bestSpread) {
        const o = analytics.bestSpread;
        rec.spreadLine = `${o.name} ${o.point} (${money(o.price)})`;
        const { impliedProb: impS } = computeEV(0, o.price);
        const evS = computeEV(analytics.bestSpreadProb, o.price);
        rec.spreadImp = `Imp: ${(impS * 100).toFixed(1)}%`;
        rec.spreadModel = `Model: ${(analytics.bestSpreadProb * 100).toFixed(1)}%`;
        rec.spreadEdge = `${(evS.edge * 100).toFixed(1)}%`;
      }

      if (m.key === 'totals' && analytics.bestTotal) {
        const o = analytics.bestTotal;
        rec.totalLine = `${o.name} ${o.point} (${money(o.price)})`;
        const { impliedProb: impT } = computeEV(0, o.price);
        const evT = computeEV(analytics.bestTotalProb, o.price);
        rec.totalImp = `Imp: ${(impT * 100).toFixed(1)}%`;
        rec.totalModel = `Model: ${(analytics.bestTotalProb * 100).toFixed(1)}%`;
        rec.totalEdge = `${(evT.edge * 100).toFixed(1)}%`;
      }
    });

    rows.push(rec);
  });

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Book</th>
          <th>ML (odds)</th><th>Imp %</th><th>Model %</th><th>Edge %</th>
          <th>Spread (line)</th><th>Imp %</th><th>Model %</th><th>Edge %</th>
          <th>Total (O/U)</th><th>Imp %</th><th>Model %</th><th>Edge %</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td>${r.book}</td>
            <td>${r.mlOdds}</td><td>${r.mlImp}</td><td>${r.mlModel}</td><td class="ev-pos">${r.mlEdge}</td>
            <td>${r.spreadLine}</td><td>${r.spreadImp}</td><td>${r.spreadModel}</td><td class="ev-pos">${r.spreadEdge}</td>
            <td>${r.totalLine}</td><td>${r.totalImp}</td><td>${r.totalModel}</td><td class="ev-pos">${r.totalEdge}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

loadGames();
setInterval(loadGames, 5 * 60 * 1000);
