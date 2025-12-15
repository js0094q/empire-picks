const SHARP_BOOKS = ["Pinnacle", "Circa", "BetOnline"];
const SOFT_BOOKS = ["PointsBet", "BetMGM"];

function getWeight(book) {
  return SHARP_BOOKS.includes(book) ? 1.5 : SOFT_BOOKS.includes(book) ? 0.7 : 1;
}

function calculateConsensusEV(outcomes) {
  let totalWeight = 0, probSum = 0;

  outcomes.forEach(o => {
    const weight = getWeight(o.bookmaker);
    totalWeight += weight;
    probSum += o.probability * weight;
  });

  const consensusProb = probSum / totalWeight;
  const odds = outcomes[0].odds;
  const implied = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  const ev = ((consensusProb * (odds > 0 ? odds : 100)) - 100).toFixed(1);

  return { ev, consensusProb };
}

function createGameCard(game) {
  const card = document.createElement("div");
  card.className = "bg-slate-950 p-5 rounded-2xl border border-white/10 space-y-4";

  const kickoff = new Date(game.commence_time).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' });

  const header = `
    <div class="flex justify-between items-center">
      <div class="flex items-center gap-3">
        <img src="/logos/${game.home_team_abbrev}.png" class="w-11 h-11" />
        <div class="text-white font-semibold">${game.away_team} @ ${game.home_team}</div>
      </div>
      <div class="text-xs text-slate-400">${kickoff}</div>
    </div>
  `;

  const markets = game.markets.map(mkt => {
    const { ev, consensusProb } = calculateConsensusEV(mkt.outcomes);
    const highlight = ev >= 10 ? "text-green-400" : ev < 0 ? "text-red-400" : "text-yellow-300";

    return `
      <div class="grid grid-cols-3 gap-4 bg-white/5 rounded-lg px-4 py-2 text-sm">
        <div>${mkt.market}</div>
        <div class="text-right">${mkt.outcomes[0].label}</div>
        <div class="text-right ${highlight}">${ev}% EV</div>
      </div>
    `;
  }).join("");

  const smartPick = game.best_pick ? `
    <div class="bg-emerald-400 text-emerald-900 text-xs px-3 py-1 rounded-full inline-block font-bold shadow">
      🔥 Smart Pick: ${game.best_pick}
    </div>` : '';

  card.innerHTML = header + markets + smartPick;
  card.appendChild(createAccordion("📊 Show Odds Info", createGameMeta(game)));
  card.appendChild(createPropsAccordion(game.id));
  return card;
}

function createGameMeta(game) {
  return `
    <div class="text-sm text-slate-300 space-y-2">
      <p><strong>Kickoff:</strong> ${new Date(game.commence_time).toLocaleString()}</p>
      <p><strong>Markets:</strong> ${game.markets.length}</p>
      <p><strong>Books:</strong> ${game.bookmakers?.length || 0}</p>
    </div>
  `;
}

function createAccordion(title, innerHTML) {
  const section = document.createElement("div");
  section.className = "pt-3 mt-4 border-t border-white/10";

  const toggle = document.createElement("button");
  toggle.className = "w-full text-left text-yellow-300 font-semibold text-sm py-2";
  toggle.textContent = title;

  const content = document.createElement("div");
  content.className = "hidden text-sm mt-2";
  content.innerHTML = innerHTML;

  toggle.onclick = () => content.classList.toggle("hidden");
  section.append(toggle, content);
  return section;
}

function createPropsAccordion(gameId) {
  const section = document.createElement("div");
  section.className = "pt-3 mt-4 border-t border-white/10";

  const toggle = document.createElement("button");
  toggle.className = "w-full text-left text-cyan-300 font-semibold text-sm py-2";
  toggle.textContent = "🏈 Show Player Props";

  const content = document.createElement("div");
  content.className = "hidden text-sm mt-2";
  content.innerHTML = `<div class="text-slate-400 italic">Loading props...</div>`;

  let loaded = false;
  toggle.onclick = async () => {
    content.classList.toggle("hidden");
    if (loaded) return;

    try {
      const res = await fetch(`/api/props?id=${gameId}`);
      const data = await res.json();

      content.innerHTML = data.length
        ? data.map(p => `
          <div class="flex justify-between bg-white/5 px-3 py-2 rounded-md">
            <span class="text-xs text-white">${p.player}</span>
            <span class="text-xs text-slate-400">${p.market}: ${p.value}</span>
          </div>`).join("")
        : `<div class="text-slate-400 italic">No props found.</div>`;

      loaded = true;
    } catch {
      content.innerHTML = `<div class="text-red-400">Error loading props.</div>`;
    }
  };

  section.append(toggle, content);
  return section;
}

async function loadGames() {
  const container = document.getElementById("games-container");
  container.innerHTML = "<div class='text-slate-400'>Loading...</div>";

  try {
    const res = await fetch("/api/games");
    const data = await res.json();
    container.innerHTML = "";

    data.forEach(game => container.appendChild(createGameCard(game)));

    document.getElementById("profile-bar").textContent =
      `⚔️ Sharp Level 1 • 🔥 Win Streak: ${Math.floor(Math.random() * 5)} • Picks Analyzed: ${data.length}`;
  } catch {
    container.innerHTML = "<div class='text-red-400'>Could not load data.</div>";
  }
}

document.getElementById("refresh-btn").addEventListener("click", loadGames);
window.addEventListener("DOMContentLoaded", loadGames);
