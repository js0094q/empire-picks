document.addEventListener("DOMContentLoaded", loadPropsHub);

async function loadPropsHub() {
  const container = document.getElementById("props-container");
  container.innerHTML = `<div class="loader">Loading props...</div>`;

  try {
    const res = await fetch("/api/odds-events");
    const games = await res.json();
    container.innerHTML = "";

    games.forEach(game => {
      if (!game.odds || !game.odds.bookmakers) return;
      const propsByMarket = extractPropsByMarket(game);
      container.innerHTML += renderGameHeader(game);
      Object.entries(propsByMarket).forEach(([market, props]) => {
        container.innerHTML += renderMarketLabel(market);
        props.forEach(prop => {
          container.innerHTML += renderPropCard(prop);
        });
      });
      container.innerHTML += `<hr class="market-divider">`;
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error">Failed loading props data.</div>`;
  }
}

function extractPropsByMarket(game) {
  const map = {};
  (game.odds.bookmakers || []).forEach(bm => {
    (bm.markets || []).forEach(m => {
      if (!m.key.startsWith("player_")) return;
      if (!map[m.key]) map[m.key] = [];

      (m.outcomes || []).forEach(o => {
        if (typeof o.price !== "number") return;
        const implied = impliedProb(o.price);
        const fair = 0.5; // placeholder
        const ev = fair - implied;
        map[m.key].push({
          market: m.key,
          player: o.name,
          odds: o.price,
          implied,
          fair,
          ev,
          team: game.home_team,
          book: bm.title,
          id: `${game.id}-${m.key}-${o.name}`
        });
      });
    });
  });

  Object.keys(map).forEach(key => {
    map[key].sort((a, b) => b.ev - a.ev);
  });

  return map;
}

function impliedProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function fmtOdds(odds) {
  return odds > 0 ? `+${odds}` : `${odds}`;
}

function renderGameHeader(game) {
  const away = TeamAssets.get(game.away_team).logoUrl;
  const home = TeamAssets.get(game.home_team).logoUrl;
  return `
    <div class="game-card">
      <div class="props-game-header">
        <div class="team"><img src="${away}" class="team-logo"> ${game.away_team}</div>
        <div style="color:var(--muted);">vs</div>
        <div class="team"><img src="${home}" class="team-logo"> ${game.home_team}</div>
      </div>
    </div>
  `;
}

function renderMarketLabel(market) {
  return `<div class="market-header">${marketLabel(market)}</div>`;
}

function renderPropCard(p) {
  return `
    <div class="prop-card">
      <div class="prop-top">
        <div>
          <div class="prop-player">${p.player}</div>
          <div class="prop-market">${marketLabel(p.market)}</div>
        </div>
        <div class="prop-odds">${fmtOdds(p.odds)}</div>
      </div>
      <div class="prop-stats">
        <div>Implied: ${(p.implied * 100).toFixed(1)}%</div>
        <div>Model: ${(p.fair * 100).toFixed(1)}%</div>
        <div class="prop-ev">EV: ${(p.ev * 100).toFixed(1)}%</div>
      </div>
      <button class="button small" onclick='Parlay.add(${JSON.stringify(p)})'>Add to Parlay</button>
    </div>
  `;
}

function marketLabel(key) {
  const labels = {
    "player_pass_yds": "Passing Yards",
    "player_rush_yds": "Rushing Yards",
    "player_reception_yds": "Receiving Yards",
    "player_anytime_td": "Anytime TD",
    "player_pass_tds": "Passing TDs"
  };
  return labels[key] || key.replace("player_", "").replace(/_/g, " ");
}
