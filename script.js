import { Teams } from "./teams.js";

/* HELPERS */

const pct = x => (x == null ? "—" : (x * 100).toFixed(1) + "%");
const fmtOdds = o => (o == null ? "—" : o > 0 ? `+${o}` : `${o}`);

const strengthFromEV = ev => {
  if (ev > 0.08) return { cls: "strength-very-strong", txt: "VSTR" };
  if (ev > 0.04) return { cls: "strength-strong", txt: "STR" };
  if (ev > 0.015) return { cls: "strength-moderate", txt: "MOD" };
  return { cls: "strength-weak", txt: "WEAK" };
};

/* FETCH */

const fetchGames = async () => {
  const r = await fetch("/api/events");
  if (!r.ok) throw new Error("Failed to load games");
  return r.json();
};

const fetchProps = async id => {
  const r = await fetch(`/api/props?id=${encodeURIComponent(id)}`);
  if (!r.ok) throw new Error("Failed to load props");
  return r.json();
};

/* RENDERERS */

const marketRow = ({ marketType, label, name, odds, bookProb, modelProb, ev }) => {
  const s = strengthFromEV(ev);
  return `
    <div class="market-row">
      <span class="market-tag ${marketType}">${label}</span>
      <div class="market-main">
        <div class="market-name">${name}</div>
        <div class="market-odds">${fmtOdds(odds)}</div>
        <div class="market-meta">Book ${pct(bookProb)} · Model ${pct(modelProb)}</div>
      </div>
      <div class="strength-bubble ${s.cls}">${s.txt}</div>
      <button class="parlay-btn">+ Parlay</button>
    </div>
  `;
};

const gameCard = game => {
  const home = Teams[game.home_team];
  const away = Teams[game.away_team];
  const kickoff = new Date(game.commence_time).toLocaleString("en-US", {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  });

  let html = `
    <div class="game-card" data-id="${game.id}">
      <div class="game-header">
        <div class="teams">
          <img src="${away.logo}" />
          <span>@</span>
          <img src="${home.logo}" />
        </div>
        <div class="kickoff">${kickoff}</div>
      </div>
      <button class="props-toggle">Show Props</button>
  `;

  const pickBest = obj =>
    Object.values(obj || {}).sort((a,b) => (b.ev ?? 0) - (a.ev ?? 0))[0];

  const ml = pickBest(game.best?.ml);
  const spread = pickBest(game.best?.spread);
  const total = pickBest(game.best?.total);

  ml && (html += marketRow({
    marketType: "ml", label: "ML",
    name: ml.name || game.home_team,
    odds: ml.odds,
    bookProb: ml.implied,
    modelProb: ml.consensus_prob,
    ev: ml.ev
  }));

  spread && (html += marketRow({
    marketType: "spread", label: "SPREAD",
    name: spread.name,
    odds: spread.odds,
    bookProb: spread.implied,
    modelProb: spread.consensus_prob,
    ev: spread.ev
  }));

  total && (html += marketRow({
    marketType: "total", label: "TOTAL",
    name: total.name,
    odds: total.odds,
    bookProb: total.implied,
    modelProb: total.consensus_prob,
    ev: total.ev
  }));

  html += `<div class="props-container"></div></div>`;
  return html;
};

/* BOOT */

document.addEventListener("DOMContentLoaded", async () => {
  const container = document.getElementById("games-container");

  const games = (await fetchGames())
    .sort((a,b) => new Date(a.commence_time) - new Date(b.commence_time));

  container.innerHTML = games.map(gameCard).join("");
});
