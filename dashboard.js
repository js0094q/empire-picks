// dashboard.js — analytics dashboard for all loaded games

const API_KEY = 'YOUR_ODDS_API_KEY_HERE';
const SPORT = 'americanfootball_nfl';
const REGIONS = 'us';
const MARKETS = ['h2h','spreads','totals'];

const container = document.getElementById('dashboard-container');
const navBack = document.getElementById('nav-back');

navBack.addEventListener('click', () => {
  window.location.href = '/';
});

async function fetchOdds() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS.join(',')}`;
  const resp = await fetch(url);
  return resp.json();
}

function prob(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return Math.abs(odds) / (Math.abs(odds) + 100);
}

function computeRow(game) {
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

  const impliedAway = prob(away);
  const impliedHome = prob(home);
  const sum = impliedAway + impliedHome;
  const nvAway = impliedAway / sum;
  const nvHome = impliedHome / sum;

  return {
    gameId: game.id,
    teams: `${game.teams[0]} @ ${game.teams[1]}`,
    mlAway: money(away),
    mlHome: money(home),
    winProbAway: (nvAway * 100).toFixed(1),
    winProbHome: (nvHome * 100).toFixed(1),
    spreadProb: (bestSpreadProb * 100).toFixed(1),
    totalOverProb: (bestTotalProb * 100).toFixed(1)
  };
}

function money(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

async function buildDashboard() {
  const data = await fetchOdds();
  const rows = data.map(computeRow);

  container.innerHTML = `
    <table class="dashboard-table">
      <thead>
        <tr>
          <th>Game</th>
          <th>ML Away</th>
          <th>Win % Away</th>
          <th>ML Home</th>
          <th>Win % Home</th>
          <th>Spread % (best market)</th>
          <th>Total O % (best market)</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map(
            r => `
          <tr>
            <td>${r.teams}</td>
            <td>${r.mlAway}</td>
            <td>${r.winProbAway}%</td>
            <td>${r.mlHome}</td>
            <td>${r.winProbHome}%</td>
            <td>${r.spreadProb}%</td>
            <td>${r.totalOverProb}%</td>
          </tr>
        `
          )
          .join('')}
      </tbody>
    </table>
  `;
}

buildDashboard();
setInterval(buildDashboard, 5 * 60 * 1000);
