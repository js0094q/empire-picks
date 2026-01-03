const gamesEl = document.getElementById("games");

function arrow(val) {
  return val > 0 ? "↑" : "↓";
}

function pct(x) {
  return (x * 100).toFixed(1) + "%";
}

async function fetchGames() {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("events failed");
  return r.json();
}

async function fetchProps(gameId) {
  const r = await fetch(`/api/props?eventId=${gameId}`);
  if (!r.ok) return [];
  return r.json();
}

function renderGame(game) {
  const m = game.bestMarket;
  const lean = m.sharpLean;

  const card = document.createElement("div");
  card.className = "game-card";

  card.innerHTML = `
    <div class="game-header">
      <div class="teams">${game.away} @ ${game.home}</div>
      <div class="time">${new Date(game.commence_time).toLocaleString()}</div>
    </div>

    <div class="market">
      <div class="pick">
        <span class="market-type">${m.market.toUpperCase()}</span>
        <span class="selection">${m.pick} ${m.line ?? ""}</span>
        <span class="price">${m.bestPrice}</span>
        <span class="book">${m.book}</span>
      </div>

      <div class="badges">
        <span class="badge lean">
          Sharp Lean ${arrow(lean)} ${pct(Math.abs(lean))}
        </span>
        <span class="badge value">
          EV ${pct(m.ev)}
        </span>
        <span class="badge stability">
          Stability ${pct(m.stability)}
        </span>
        <span class="badge decision ${m.decision}">
          ${m.decision}
        </span>
      </div>
    </div>

    <button class="props-toggle">Show Props</button>
    <div class="props"></div>
  `;

  const btn = card.querySelector(".props-toggle");
  const propsEl = card.querySelector(".props");

  btn.onclick = async () => {
    if (propsEl.classList.contains("open")) {
      propsEl.classList.remove("open");
      btn.textContent = "Show Props";
      return;
    }

    btn.textContent = "Loading Props…";
    propsEl.classList.add("open");

    const props = await fetchProps(game.id);
    if (!props.length) {
      propsEl.innerHTML = `<div class="muted">No playable props.</div>`;
    } else {
      propsEl.innerHTML = props
        .map(
          p => `
          <div class="prop-row">
            <div class="prop-main">
              <strong>${p.player}</strong>
              <span>${p.side} ${p.line}</span>
            </div>
            <div class="prop-meta">
              <span>${p.price}</span>
              <span class="arrow">${arrow(p.sharpLean)}</span>
              <span class="ev">EV ${pct(p.ev)}</span>
              <span class="decision PLAY">PLAY</span>
            </div>
          </div>
        `
        )
        .join("");
    }

    btn.textContent = "Hide Props";
  };

  return card;
}

async function init() {
  try {
    const games = await fetchGames();
    gamesEl.innerHTML = "";

    if (!games.length) {
      gamesEl.innerHTML = `<div class="muted">No high-confidence games.</div>`;
      return;
    }

    games.forEach(g => gamesEl.appendChild(renderGame(g)));
  } catch (e) {
    gamesEl.innerHTML = `<div class="muted">Failed to load games.</div>`;
    console.error(e);
  }
}

init();
