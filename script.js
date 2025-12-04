// public/script.js — front-end odds + props + EV/edge logic, using Vercel API proxy

const gamesContainer = document.getElementById('games-container');
const navLive = document.getElementById('nav-live');
const navDashboard = document.getElementById('nav-dashboard');
const liveSection = document.getElementById('live-games');
const dashboardSection = document.getElementById('dashboard');

const SPORT = 'americanfootball_nfl';  // for props endpoint when needed

// Navigation toggles
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

// Utility: convert American odds to implied probability (decimal)
function impliedProbFromAmerican(odds) {
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    return Math.abs(odds) / (Math.abs(odds) + 100);
  }
}

// Compute EV / edge given a win probability and American odds (stake = 1 unit)
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

// Fetch odds via your backend proxy
async function fetchOdds() {
  try {
    const resp = await fetch('/api/odds');
    if (!resp.ok) {
      console.error('Backend odds fetch failed', resp.status, await resp.text());
      return null;
    }
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('Odds fetch error', err);
    return null;
  }
}

// Fetch props for a specific event via backend proxy
async function fetchProps(eventId) {
  try {
    const resp = await fetch(`/api/props?eventId=${encodeURIComponent(eventId)}`);
    if (!resp.ok) {
      console.warn(`Props fetch failed for event ${eventId}`, resp.status);
      return null;
    }
    const data = await resp.json();
    return data;
  } catch (err) {
    console.error('Props fetch error', err);
    return null;
  }
}

async function loadGames() {
  const data = await fetchOdds();
  if (!data) {
    gamesContainer.innerHTML = `<div class="error">Failed to load odds. Check console for details.</div>`;
    return;
  }
}

  // Sort games by start time, ascending
  data.sort((a, b) => new Date(a.commence_time) - new Date(b.commence_time));

  gamesContainer.innerHTML = '';
  for (const game of data) {
    if (!game.bookmakers) continue;
    const analytics = computeAnalytics(game);
    const card = await buildGameCard(game, analytics);
    gamesContainer.appendChild(card);
  }
}

// Compute baseline analytics (no-vig normalized win probabilities, best spread & total)
function computeAnalytics(game) {
  let away = null, home = null;
  let bestSpread = null, bestSpreadProb = 0;
  let bestTotal = null, bestTotalProb = 0;

  for (const bm of game.bookmakers) {
    for (const m of bm.markets) {
      if (m.key === 'h2h') {
        for (const o of m.outcomes) {
          if (o.name === game.teams[0]) away = o.price;
          if (o.name === game.teams[1]) home = o.price;
        }
      }
      if (m.key === 'spreads') {
        for (const o of m.outcomes) {
          const p = impliedProbFromAmerican(o.price);
          if (p > bestSpreadProb) {
            bestSpreadProb = p;
            bestSpread = o;
          }
        }
      }
      if (m.key === 'totals') {
        for (const o of m.outcomes) {
          const p = impliedProbFromAmerican(o.price);
          if (p > bestTotalProb) {
            bestTotalProb = p;
            bestTotal = o;
          }
        }
      }
    }
  }

  let nvAway = 0.5, nvHome = 0.5;
  if (away != null && home != null) {
    const impAway = impliedProbFromAmerican(away);
    const impHome = impliedProbFromAmerican(home);
    const sum = impAway + impHome;
    nvAway = impAway / sum;
    nvHome = impHome / sum;
  }

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

// Build a full game card: lines + props
async function buildGameCard(game, analytics) {
  const card = document.createElement('div');
  card.className = 'game-card';

  const hdr = document.createElement('div');
  hdr.className = 'game-header';
  hdr.innerHTML = `
    <div class="teams">${analytics.away} @ ${analytics.home}</div>
    <div class="start-time">${new Date(game.commence_time).toLocaleString()}</div>
  `;
  card.appendChild(hdr);

  const body = document.createElement('div');
  body.className = 'game-body';

  const tableWrapper = document.createElement('div');
  renderLines(tableWrapper, game, analytics);
  body.appendChild(tableWrapper);

  const propsWrapper = document.createElement('div');
  propsWrapper.className = 'props-wrapper';
  await renderProps(propsWrapper, game);
  body.appendChild(propsWrapper);

  card.appendChild(body);
  return card;
}

// Render moneyline / spread / total table with implied %, model %, edge %
function renderLines(container, game, analytics) {
  const rows = [];

  for (const bm of game.bookmakers) {
    const rec = {
      book: bm.title,
      mlOdds: "-", mlImp: "", mlModel: "", mlEdge: "",
      spreadLine: "-", spreadImp: "", spreadModel: "", spreadEdge: "",
      totalLine: "-", totalImp: "", totalModel: "", totalEdge: ""
    };

    for (const m of bm.markets) {
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
    }

    rows.push(rec);
  }

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

// Render top 10 props (if available)
async function renderProps(container, game) {
  const propsData = await fetchProps(game.id);
  if (!propsData || !propsData.length) {
    return;
  }

  // flatten props across bookmakers/markets/outcomes
  const props = propsData[0].bookmakers.flatMap(bm =>
    bm.markets.flatMap(m =>
      m.outcomes.map(o => ({
        name: o.name,
        price: o.price,
        bookmaker: bm.title
      }))
    )
  );

  const topProps = props.slice(0, 10);

  const html = topProps.map(p => {
    const imp = impliedProbFromAmerican(p.price);
    return `<div class="prop-row">
      <span class="prop-name">${p.name} (${p.bookmaker})</span>
      <span class="prop-odds">${money(p.price)}</span>
      <span class="prop-imp">${(imp*100).toFixed(1)}% imp</span>
    </div>`;
  }).join('');

  container.innerHTML = topProps.length
    ? `<div class="props-list">${html}</div>`
    : '';
}

loadGames();
setInterval(loadGames, 5 * 60 * 1000);
