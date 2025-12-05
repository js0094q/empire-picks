// ===============================================================
// EMPIREPICKS — PROPS HUB (Group by Game → Market)
// ===============================================================

document.addEventListener("DOMContentLoaded", loadPropsHub);

async function loadPropsHub() {
  const container = document.getElementById("props-container");
  container.innerHTML = `<div class="loader">Loading props...</div>`;

  try {
    // Fetch all games with full odds + props
    const res = await fetch("/api/odds-events");
    const games = await res.json();

    container.innerHTML = "";

    games.forEach(game => {
      if (!game.odds || !game.odds.bookmakers) return;

      const markets = extractPropsByMarket(game);

      container.innerHTML += renderGamePropsHeader(game);

      Object.entries(markets).forEach(([market, props]) => {
        container.innerHTML += renderMarketHeader(market);
        props.forEach(p => {
          container.innerHTML += renderPropCard(p);
        });
      });

      container.innerHTML += `<hr class="market-divider">`;
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error">Failed loading props data.</div>`;
  }
}

// ===============================================================
// EXTRACT PROPS → MARKET GROUPING
// ===============================================================

function extractPropsByMarket(game) {
  const markets = {};

  const bmList = game.odds.bookmakers || [];
  bmList.forEach(bm => {
    (bm.markets || []).forEach(m => {
      if (!m.key.startsWith("player_")) return;

      if (!markets[m.key]) markets[m.key] = [];

      (m.outcomes || []).forEach(o => {
        if (typeof o.price !== "number") return;

        const implied = impliedProb(o.price);
        const fair = 0.50; // placeholder model probability
        const ev = fair - implied;

        markets[m.key].push({
          market: m.key,
          player: o.name,
          odds: o.price,
          implied,
          fair,
          ev,
          game: `${game.away_team} @ ${game.home_team}`,
          book: bm.title
        });
      });
    });
  });

  // SORT: EV descending per market
  Object.keys(markets).forEach(m => {
    markets[m].sort((a,b) => b.ev - a.ev);
  });

  return markets;
}

// ===============================================================
// EV + IMPLIED PROBABILITY
// ===============================================================

function impliedProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

// ===============================================================
// RENDER UI COMPONENTS
// ===============================================================

function renderGamePropsHeader(game) {
  const away = TeamAssets.get(game.away_team).logoUrl;
  const home = TeamAssets.get(game.home_team).logoUrl;

  return `
    <div class="game-card" style="margin-top:25px;">
      <div class="props-game-header">
        <div class="team">
          <img src="${away}" class="team-logo">
          <span>${game.away_team}</span>
        </div>
        <div style="color:var(--muted);">vs</div>
        <div class="team">
          <img src="${home}" class="team-logo">
          <span>${game.home_team}</span>
        </div>
      </div>
    </div>
  `;
}

function renderMarketHeader(market) {
  const pretty = marketLabel(market);
  return `
    <div class="market-header">${pretty}</div>
  `;
}

function renderPropCard(p) {
  const oddsFmt = p.odds > 0 ? `+${p.odds}` : p.odds;

  return `
    <div class="prop-card">
      <div class="prop-top">
        <div>
          <div class="prop-player">${p.player}</div>
          <div class="prop-market">${marketLabel(p.market)}</div>
        </div>
        <div class="prop-odds">${oddsFmt}</div>
      </div>

      <div class="prop-stats">
        <div>Implied: ${(p.implied*100).toFixed(1)}%</div>
        <div>Model: ${(p.fair*100).toFixed(1)}%</div>
        <div class="prop-ev">EV: ${(p.ev*100).toFixed(1)}%</div>
      </div>

      <button class="button small"
        onclick='addToParlay("${p.player} - ${marketLabel(p.market)}", "${p.odds}", "${p.book}")'>
        Add to Parlay
      </button>
    </div>
  `;
}

function marketLabel(key) {
  const map = {
    "player_pass_attempts": "Passing Attempts",
    "player_pass_completions": "Pass Completions",
    "player_pass_tds": "Passing TDs",
    "player_pass_yds": "Passing Yards",

    "player_receptions": "Receptions",
    "player_reception_tds": "Receiving TDs",
    "player_reception_yds": "Receiving Yards",

    "player_rush_tds": "Rushing TDs",
    "player_rush_yds": "Rushing Yards",

    "player_tds_over": "Anytime TD (Over)",
    "player_anytime_td": "Anytime TD"
  };
  return map[key] || key;
}
