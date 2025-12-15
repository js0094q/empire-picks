// === Sharp / Soft Book Weighting ===
const SHARP_BOOKS = ['Pinnacle', 'Circa', 'BetOnline'];
const SOFT_BOOKS = ['PointsBet', 'BetMGM'];

function getBookWeight(bookmaker) {
  if (SHARP_BOOKS.includes(bookmaker)) return 1.5;
  if (SOFT_BOOKS.includes(bookmaker)) return 0.7;
  return 1.0;
}

function calculateEV(prob, odds) {
  const decimal = odds > 0 ? (odds + 100) / 100 : 100 / Math.abs(odds);
  const edge = (decimal * prob) - 1;
  return (edge * 100).toFixed(1);
}

// === Accordion Components ===
function buildAccordion(label, contentHTML, accent = "yellow") {
  const section = document.createElement("div");
  section.className = "border-t border-white/10 pt-3 mt-4";

  const toggle = document.createElement("button");
  toggle.className = `w-full flex justify-between items-center text-left text-${accent}-300 font-bold text-sm py-2`;
  toggle.textContent = label;

  const content = document.createElement("div");
  content.className = "text-sm space-y-2 hidden";
  content.innerHTML = contentHTML;

  toggle.onclick = () => content.classList.toggle("hidden");

  section.appendChild(toggle);
  section.appendChild(content);
  return section;
}

function buildPropsAccordion(gameId) {
  const section = document.createElement("div");
  section.className = "border-t border-white/10 pt-3 mt-4";

  const toggle = document.createElement("button");
  toggle.className = `w-full flex justify-between items-center text-left text-cyan-300 font-semibold text-sm py-2`;
  toggle.textContent = "🏈 Load Player Props";

  const content = document.createElement("div");
  content.className = "text-sm space-y-2 hidden";
  content.innerHTML = `<div class="text-slate-400 italic">Loading props…</div>`;

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
        : `<div class="text-slate-400 italic">No props available.</div>`;

      loaded = true;
    } catch {
      content.innerHTML = `<div class="text-red-400 italic">Error loading props.</div>`;
    }
  };

  section.appendChild(toggle);
  section.appendChild(content);
  return section;
}

// === Game Card Generator ===
function createCard(game) {
  const card = document.createElement("div");
  card.className = "bg-slate-950 rounded-2xl p-4 mb-6 border border-white/5";

  // Game header
  const header = document.createElement("div");
  header.className = "flex justify-between items-center mb-3";

  const teams = document.createElement("div");
  teams.className = "flex items-center gap-2";
  teams.innerHTML = `<img src="/logos/${game.home_team_abbrev}.png" class="w-11 h-11" />
                     <span class="font-semibold">${game.away_team} @ ${game.home_team}</span>`;

  const kickoff = document.createElement("span");
  kickoff.className = "text-xs text-slate-400";
  kickoff.textContent = new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  header.appendChild(teams);
  header.appendChild(kickoff);
  card.appendChild(header);

  // Market Boxes
  const marketRow = document.createElement("div");
  marketRow.className = "flex gap-3 mb-3";

  game.markets.forEach(m => {
    const box = document.createElement("div");
    box.className = "flex-1 grid grid-cols-3 gap-3 bg-white/5 p-3 rounded-xl";

    const ev = calculateEV(m.prob, m.odds);
    box.innerHTML = `
      <div class="text-xs font-medium text-white">${m.key}</div>
      <div class="text-xs text-right text-white">${m.outcome}</div>
      <div class="text-xs text-right ${ev > 0 ? 'text-green-400' : 'text-red-400'}">${ev}% EV</div>
    `;

    marketRow.appendChild(box);
  });

  card.appendChild(marketRow);

  // Smart Pick badge
  if (game.best_pick) {
    const badge = document.createElement("span");
    badge.className = "inline-block mt-2 px-3 py-1 text-xs font-bold rounded bg-emerald-400 text-emerald-900 shadow";
    badge.textContent = `🔥 Smart Pick: ${game.best_pick}`;
    card.appendChild(badge);
  }

  // Add accordions
  card.appendChild(buildAccordion("📊 Show Game Info", `
    <p class="text-slate-300">Start Time: ${new Date(game.commence_time).toLocaleString()}</p>
    <p class="text-slate-300">Bookmakers: ${game.bookmakers.length}</p>
  `));

  card.appendChild(buildPropsAccordion(game.id));
  return card;
}

// === Load Games ===
async function loadGames() {
  const container = document.getElementById("games-container");
  container.innerHTML = "<div class='text-slate-400'>Loading games…</div>";

  try {
    const res = await fetch("/api/games");
    const data = await res.json();

    container.innerHTML = "";
    data.forEach(game => container.appendChild(createCard(game)));

    document.getElementById("profile-bar").textContent =
      `⚔️ Sharp Level 1 • 🔥 Win Streak: ${Math.floor(Math.random() * 5)} • Picks Analyzed: ${data.length}`;
  } catch {
    container.innerHTML = "<div class='text-red-400'>Error loading data.</div>";
  }
}

// === Refresh Button ===
document.getElementById("refresh-btn").addEventListener("click", loadGames);
window.addEventListener("DOMContentLoaded", loadGames);
