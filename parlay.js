// parlay.js — supports ML, Spread, Total, and Props legs

// ---------- Helper: convert one American odds to decimal multiplier ----------
function americanToDecimal(odds) {
  odds = Number(odds);
  if (odds > 0) {
    return (odds / 100) + 1;
  } else {
    return (100 / Math.abs(odds)) + 1;
  }
}

// ---------- Parlay slip state ----------
const parlay = {
  legs: []
};

function addLeg(leg) {
  // leg must include: market, price (American odds), and identifying info
  parlay.legs.push(leg);
  renderParlay();
}

function removeLeg(index) {
  parlay.legs.splice(index, 1);
  renderParlay();
}

function clearParlay() {
  parlay.legs = [];
  renderParlay();
}

// ---------- Compute parlay odds & payout ----------
function computeParlay(multiplierLegs) {
  // Convert each leg’s American odds → decimal, then multiply
  let dec = 1;
  for (const leg of multiplierLegs) {
    const d = americanToDecimal(leg.price);
    dec *= d;
  }
  return dec;
}

// ---------- Render parlay slip UI ----------
function renderParlay() {
  const container = document.getElementById("parlay-slip");
  if (!container) return;

  container.innerHTML = "";  

  if (!parlay.legs.length) {
    container.textContent = "Parlay slip is empty.";
    return;
  }

  const ul = document.createElement("ul");
  parlay.legs.forEach((leg, i) => {
    const li = document.createElement("li");
    let desc = "";
    if (leg.market === "PROP") {
      desc = `${leg.player} — ${leg.type} ${leg.side} ${leg.point || ""} @ ${leg.price}`;
    } else {
      // ML / SPREAD / TOTAL
      desc = `${leg.market} — ${leg.team || leg.game} @ ${leg.price}`;
    }
    li.textContent = desc + "  ";
    const btn = document.createElement("button");
    btn.textContent = "Remove";
    btn.addEventListener("click", () => removeLeg(i));
    li.appendChild(btn);
    ul.appendChild(li);
  });
  container.appendChild(ul);

  // Compute combined odds
  const decTotal = computeParlay(parlay.legs);
  const americanCombined = decTotal >= 2
    ? "+" + Math.round((decTotal - 1) * 100)
    : "-" + Math.round(100 / (decTotal - 1));

  const p = document.createElement("div");
  p.textContent = `Combined Parlay Odds: ${americanCombined}`;
  container.appendChild(p);

  const stakeInput = document.createElement("input");
  stakeInput.type = "number";
  stakeInput.min = 1;
  stakeInput.placeholder = "Stake $";
  stakeInput.style.margin = "8px 0";
  container.appendChild(stakeInput);

  const payoutBtn = document.createElement("button");
  payoutBtn.textContent = "Calculate payout";
  payoutBtn.addEventListener("click", () => {
    const stake = Number(stakeInput.value);
    if (!stake || stake <= 0) return;
    const payout = (stake * decTotal).toFixed(2);
    alert(`If all legs win: you get $${payout} (incl. stake)`);
  });
  container.appendChild(payoutBtn);
}

// ---------- Hook “Add leg” buttons automatically ----------
document.addEventListener("click", e => {
  if (!e.target.matches("button.add-leg")) return;
  const btn = e.target;

  const market = btn.dataset.market;
  const leg = { market, price: btn.dataset.price };

  if (market === "PROP") {
    leg.type = btn.dataset.type;
    leg.player = btn.dataset.player;
    leg.side   = btn.dataset.side;
    leg.point  = btn.dataset.point;
    leg.game   = btn.dataset.game;
  } else {
    leg.team   = btn.dataset.team;
    leg.game   = btn.dataset.game;
    if (btn.dataset.side) leg.side = btn.dataset.side;
  }

  addLeg(leg);
});
