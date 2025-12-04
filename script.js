const API_KEY = 'YOUR_ODDS_API_KEY_HERE';
const SPORT = 'americanfootball_nfl';
const REGIONS = 'us';
const MARKETS = ['h2h','spreads','totals','player_props'];

const gamesContainer = document.getElementById('games-container');

async function fetchOdds() {
  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS.join(',')}`;
  console.log('Fetching odds URL:', url);
  let resp;
  try {
    resp = await fetch(url);
  } catch (err) {
    console.error('Fetch error (network or CORS):', err);
    return null;
  }

  if (!resp.ok) {
    console.error('Odds API returned error status:', resp.status, resp.statusText);
    try {
      const text = await resp.text();
      console.error('Error response:', text);
    } catch (_) { }
    return null;
  }

  try {
    const json = await resp.json();
    console.log('Odds API data:', json);
    return json;
  } catch (err) {
    console.error('Failed to parse JSON from odds API:', err);
    return null;
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
  const ev = (winProb * payout) - ((1 - winProb) * stake);
  const edge = ev / stake;
  return { ev, edge, impliedProb: impProb };
}

function money(n) {
  return n > 0 ? `+${n}` : `${n}`;
}

async function loadGames() {
  const data = await fetchOdds();
  if (!data) {
    gamesContainer.innerHTML = `<div class="error">Failed to load odds. Check console for details.</div>`;
    return;
  }

  // Sort chronologically
  data.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

  gamesContainer.innerHTML = '';
  data.forEach(game => {
    if (!game.bookmakers) {
      console.warn('Game has no bookmakers, skipping:', game);
      return;
    }
    const analytics = computeAnalytics(game);
    const card = buildGameCard(game, analytics);
    gamesContainer.appendChild(card);
  });
}

function computeAnalytics(game) {
  let away = null, home = null;
  let bestSpread = null, bestSpreadProb = 0;
  let bestTotal = null, bestTotalProb = 0;

  game.bookmakers.forEach(bm => {
    bm.markets.forEach(m => {
      if (m.key === 'h2h') {
        m.outcomes.forEach(o => {
          if (o.name === game.teams[0]) away = o.price;
          if (o.name === game.teams[1]) home = o.price;
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

  if (away == null || home == null) {
    console.warn('Missing ML odds for game:', game);
  }

  const impliedAway = away != null ? impliedProbFromAmerican(away) : 0.5;
  const impliedHome = home != null ? impliedProbFromAmerican(home) : 0.5;
  const sum = impliedAway + impliedHome;
  const nvAway = impliedAway / (sum || 1);
  const nvHome = impliedHome / (sum || 1);

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

  game.bookmakers.forEach(bm => {
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

          const { impliedProb: impA } = computeEV(0, a.price);
          const evA = computeEV(analytics.nvAway, a.price);
          rec.mlImp = `Imp: ${(impA * 100).toFixed(1)}%`;
          rec.mlModel = `${analytics.away}: ${(analytics.nvAway * 100).toFixed(1)}%`;
          rec.mlEdge = `${(evA.edge * 100).toFixed(1)}%`;
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
