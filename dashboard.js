// ===========================================
// EMPIREPICKS — PROPS + EV ANALYTICS HUB
// ===========================================

document.addEventListener("DOMContentLoaded", loadPropsEV);

async function loadPropsEV() {
  const container = document.getElementById("props-container");
  container.innerHTML = `<div class="loader">Loading Props...</div>`;

  try {
    const eventsRes = await fetch("/api/events");
    const events = await eventsRes.json();

    container.innerHTML = "";

    let allProps = [];

    for (const ev of events) {
      const oddsRes = await fetch(`/api/odds?eventId=${ev.id}`);
      const data = await oddsRes.json();
      const game = data[0];
      if (!game) continue;

      const props = extractProps(game, ev.away_team, ev.home_team);
      allProps.push(...props);
    }

    const ranked = allProps.sort((a,b)=>b.edge - a.edge).slice(0,40);

    container.innerHTML = `
      <h2 style="margin-bottom: 1rem; color: var(--fd-blue);">Top EV Props</h2>
    `;

    ranked.forEach(p => {
      container.innerHTML += renderPropCard(p);
    });

  } catch (err) {
    console.error(err);
    container.innerHTML = `<div class="error">Failed loading props.</div>`;
  }
}


// ===========================================
// PROP EXTRACTION + EV CALC
// ===========================================

function extractProps(game, away, home) {
  if (!game.bookmakers) return [];

  const props = [];

  game.bookmakers.forEach(bm => {
    bm.markets.forEach(m => {
      if (!m.key.startsWith("player_")) return;
      if (!m.outcomes) return;

      m.outcomes.forEach(o => {
        if (typeof o.price !== "number") return;

        const implied = prob(o.price);
        const fair = 0.5; // until model added

        const edge = fair - implied;

        props.push({
          market: m.key,
          player: o.name,
          odds: o.price,
          edge,
          teamAway: away,
          teamHome: home,
          bookmaker: bm.title
        });
      });
    });
  });

  return props;
}


// ===========================================
// PROP CARD
// ===========================================

function renderPropCard(p) {
  return `
    <div class="game-card">
      <div style="display:flex;justify-content:space-between;">
        <div>
          <div style="font-size:1rem;font-weight:700;">${p.player}</div>
          <div style="color:var(--muted);font-size:0.9rem;">${p.market}</div>
        </div>
        <div style="text-align:right;">
          <div style="color:var(--fd-light);">${p.bookmaker}</div>
          <div style="color:var(--ev-green);font-weight:700;">${money(p.odds)}</div>
        </div>
      </div>

      <div class="best-ev" style="margin-top:10px;">
        EV: +${(p.edge * 100).toFixed(1)}%
      </div>

      <button class="button" style="margin-top:12px;" onclick='addToParlay("${p.player}", "${p.market}", ${p.odds}, "${p.bookmaker}")'>
        Add to Parlay
      </button>
    </div>
  `;
}
