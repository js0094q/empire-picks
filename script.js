const SHARP_BOOKS = ['Pinnacle', 'Circa', 'BetOnline'];
const SOFT_BOOKS = ['PointsBet', 'BetMGM'];

function getBookWeight(bookmaker) {
  if (SHARP_BOOKS.includes(bookmaker)) return 1.5;
  if (SOFT_BOOKS.includes(bookmaker)) return 0.7;
  return 1.0;
}

function calculateEV(prob, odds) {
  const decimal = odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
  return ((prob * (decimal * 100)) - 100).toFixed(2);
}

function buildMainAccordion(game) {
  const section = document.createElement("div");
  section.className = "border-t border-white/10 pt-3 mt-4";

  const toggle = document.createElement("button");
  toggle.className = "w-full flex justify-between items-center text-left text-yellow-300 font-bold text-sm py-2";
  toggle.textContent = "📊 Show Odds Breakdown";

  const content = document.createElement("div");
  content.className = "text-sm space-y-2 hidden";
  content.innerHTML = `
    <p class="text-slate-300">Kickoff: ${new Date(game.commence_time).toLocaleString()}</p>
    <p class="text-slate-300">Bookmakers: ${game.bookmakers.length}</p>
  `;

  toggle.onclick = () => content.classList.toggle("hidden");

  section.appendChild(toggle);
  section.appendChild(content);
  return section;
}

function buildPropsAccordion(game) {
  const section = document.createElement("div");
  section.className = "border-t border-white/10 pt-3 mt-4";

  const toggle = document.createElement("button");
  toggle.className = "w-full flex justify-between items-center text-left text-cyan-300 font-semibold text-sm py-2";
  toggle.textContent = "🏈 Load Player Props";

  const content = document.createElement("div");
  content.className = "text-sm space-y-2 hidden";
  content.innerHTML = `<div class="text-slate-400 italic">Loading props…</div>`;

  let loaded = false;
  toggle.onclick = async () => {
    content.classList.toggle("hidden");
    if (loaded) return;
    try {
      const res = await fetch(`/api/props?id=${game.id}`);
      const data = await res.json();
      content.innerHTML = data.length
        ? data.map(p => `<div class="flex justify-between bg-white/5 px-3 py-2 rounded-md">
              <span class="text-xs text-white">${p.player}</span>
              <span class="text-xs text-slate-400">${p.market}: ${p.value}</span>
            </div>`).join("")
        : `<div class="text-slate-400 italic">No props found.</div>`;
      loaded = true;
    } catch {
      content.innerHTML = `<div class="text-red-400 italic">Error loading props.</div>`;
    }
  };

  section.appendChild(toggle);
  section.appendChild(content);
  return section;
}

function createCard(game) {
  const card = document.createElement("div");
  card.className = "bg-slate-950 rounded-2xl p-4 mb-6 border border-white/5";

  const header = document.createElement("div");
  header.className = "flex justify-between items-center mb-3";

  const teams = document.createElement("div");
  teams.className = "flex items-center gap-2";
  teams.innerHTML = `<img src="/logos/${game.home_team_abbrev}.png" class="w-11 h-11" /><span class="font-semibold">${game.away_team} @ ${game.home_team}</span>`;

  const kickoff = document.createElement("span");
  kickoff.className = "text-xs text-slate-400";
  kickoff.textContent = new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  header.appendChild(teams);
  header.appendChild(kickoff);
  card.appendChild(header);

  const markets = game.markets || [];
  const marketsRow = document.createElement("div");
  marketsRow.className = "flex gap-3 mb-3";

  markets.forEach(m => {
    const box = document.createElement("div");
    box.className = "flex-1 grid grid-cols-3 gap-3 bg-white/5 p-3 rounded-xl";
    const ev = calculateEV(m.prob, m.odds);
    box.innerHTML = `
      <div class="text-xs font-medium text-white">${m.key}</div>
      <div class="text-xs text-right text-white">${m.outcome}</div>
      <div class="text-xs text-right ${ev > 0 ? 'text-green-400' : 'text-red-400'}">${ev}% EV</div>
    `;
    marketsRow.appendChild(box);
  });

  card.appendChild(marketsRow);

  // Smart pick tag
  if (game.best_pick) {
    const badge = document.createElement("span");
    badge.className = "inline-block mt-2 px-3 py-1 text-xs font-bold rounded bg-emerald-400 text-emerald-900 shadow";
    badge.textContent = `🔥 Smart Pick: ${game.best_pick}`;
    card.appendChild(badge);
  }

  card.appendChild(buildMainAccordion(game));
  card.appendChild(buildPropsAccordion(game));
  return card;
}

// Main loader
async function loadGames() {
  const container = document.getElementById("games-container");
  container.innerHTML = "<div class='text-slate-400'>Loading...</div>";
  try {
    const res = await fetch("/api/games");
    const data = await res.json();
    container.innerHTML = "";
    data.forEach(game => container.appendChild(createCard(game)));
  } catch (err) {
    container.innerHTML = "<div class='text-red-400'>Failed to load games</div>";
  }
}

document.getElementById("refresh-btn").addEventListener("click", loadGames);
window.addEventListener("DOMContentLoaded", loadGames);
