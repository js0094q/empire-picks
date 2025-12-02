// -- Global parlay state
const parlay = {
  legs: []  // each leg: { market, price (American), team/player, type, side, extra... }
};

// -- Convert American odds to decimal multiplier
function americanToDecimal(odds) {
  odds = Number(odds);
  if (odds > 0) return 1 + odds / 100;
  return 1 + 100 / Math.abs(odds);
}

// -- Compute total parlay odds & implied probability
function computeParlay(parlay) {
  if (!parlay.legs.length) return null;
  let dec = 1;
  for (const leg of parlay.legs) {
    dec *= americanToDecimal(leg.price);
  }
  const impliedProb = 1 / dec;
  return { decimal: dec, impliedProb };
}

// -- Render parlay slip UI
function renderParlaySlip() {
  const container = document.getElementById("parlay-slip");
  if (!container) return;
  container.innerHTML = "";

  if (parlay.legs.length === 0) {
    container.textContent = "No legs in parlay.";
    return;
  }

  const ul = document.createElement("ul");
  parlay.legs.forEach((leg, i) => {
    const li = document.createElement("li");
    li.textContent = `${leg.market} — ${leg.team || leg.player} @ ${leg.price}`;
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.onclick = () => {
      parlay.legs.splice(i, 1);
      renderParlaySlip();
    };
    li.appendChild(btn);
    ul.appendChild(li);
  });
  container.appendChild(ul);

  const result = computeParlay(parlay);
  const oddsDiv = document.createElement("div");
  oddsDiv.textContent = `Parlay odds (decimal): ${result.decimal.toFixed(2)}, implied win %: ${(result.impliedProb * 100).toFixed(1)}%`;
  container.appendChild(oddsDiv);
}

// -- Hook add-leg buttons
document.addEventListener("click", e => {
  if (!e.target.matches("button.add-leg")) return;
  const b = e.target;
  const leg = {
    market: b.dataset.market,
    price: b.dataset.price,
    team: b.dataset.team,
    player: b.dataset.player,
    type: b.dataset.type,
    side: b.dataset.side
    // add extra metadata as needed
  };
  parlay.legs.push(leg);
  renderParlaySlip();
});

// Right after page load, create a container in DOM:
// <div id="parlay-slip"></div>
