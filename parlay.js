// parlay.js — ensure this works with the updated script.js

let parlayLegs = [];

window.addParlayLeg = function(leg) {
  // avoid duplicates (same game + market + outcome)
  const key = `${leg.gameId}|${leg.market}|${leg.outcome}`;
  if (parlayLegs.some(l => l.key === key)) return;
  leg.key = key;
  parlayLegs.push(leg);
  renderParlay();
};

window.removeParlayLeg = function(key) {
  parlayLegs = parlayLegs.filter(l => l.key !== key);
  renderParlay();
};

window.renderParlay = function() {
  const container = document.getElementById("parlay-legs");
  if (!container) return;
  container.innerHTML = "";

  if (parlayLegs.length === 0) {
    container.textContent = "No legs added.";
    return;
  }

  const ul = document.createElement("ul");
  parlayLegs.forEach(leg => {
    const li = document.createElement("li");
    li.textContent = `${leg.away} @ ${leg.home} — ${leg.market.toUpperCase()}:${leg.outcome} @ ${leg.odds > 0 ? "+" + leg.odds : leg.odds}`;
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.onclick = () => window.removeParlayLeg(leg.key);
    li.appendChild(btn);
    ul.appendChild(li);
  });
  container.appendChild(ul);
};
