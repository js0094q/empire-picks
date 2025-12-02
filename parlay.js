// ========================================================
//  PARLAY MAKER MODULE — FIXED (No external imports)
// ========================================================

// American odds → Decimal
function americanToDecimal(o){
  return o > 0 ? 1 + o/100 : 1 + 100/(-o);
}

// Format +110, -120
function formatAmerican(o){
  return o > 0 ? `+${o}` : `${o}`;
}

// Internal store
const parlayLegs = [];

// DOM elements
const legsEl = document.querySelector("#parlayLegs");
const calcEl = document.querySelector("#parlayCalc");
const clearBtn = document.querySelector("#clearParlay");

// ========================================================
//  EVENT LISTENERS
// ========================================================

// Listen globally for “Add to Parlay” button clicks
document.body.addEventListener("click", e => {
  if (!e.target.classList.contains("add-leg")) return;

  const leg = {
    market: e.target.dataset.market,
    team: e.target.dataset.team,
    price: Number(e.target.dataset.price),
    trueProb: Number(e.target.dataset.trueprob),
    game: e.target.dataset.game
  };

  // Prevent more than 1 pick from the same game
  if (parlayLegs.some(l => l.game === leg.game)) {
    alert("You already have a leg from this game in your parlay.");
    return;
  }

  parlayLegs.push(leg);
  renderParlaySlip();
});

// Clear entire parlay
clearBtn.addEventListener("click", () => {
  parlayLegs.length = 0;
  renderParlaySlip();
});

// Remove one leg by index
window.removeLeg = function(i) {
  parlayLegs.splice(i, 1);
  renderParlaySlip();
};

// ========================================================
//  RENDER FUNCTIONS
// ========================================================
function renderParlaySlip() {
  if (parlayLegs.length === 0) {
    legsEl.innerHTML = "<em style='color:var(--muted);'>No legs added yet.</em>";
    calcEl.textContent = "Add legs to calculate EV…";
    return;
  }

  legsEl.innerHTML = parlayLegs
    .map((l, i) => {
      return `
      <div style="
        padding:8px;
        border-bottom:1px solid var(--border);
        font-size:0.88rem;
      ">
        <strong style="color:var(--gold);">${l.team}</strong>
        <span style="color:#9ca7c8;">(${l.market})</span>
        <br>
        <span style="color:#9ca7c8;">${l.game}</span>
        <br>
        <span style="color:#fff;">${formatAmerican(l.price)}</span>

        <button onclick="removeLeg(${i})"
          style="
            float:right;
            background:none;
            border:1px solid var(--border);
            padding:1px 5px;
            border-radius:4px;
            color:#f55;
            cursor:pointer;
          ">
          ✖
        </button>
      </div>
      `;
    })
    .join("");

  calcParlayEV();
}

// ========================================================
//  EV CALCULATION
// ========================================================
function calcParlayEV() {
  if (parlayLegs.length < 2) {
    calcEl.innerHTML = "<em style='color:var(--muted);'>Add 2+ legs to calculate parlay EV.</em>";
    return;
  }

  let trueProb = 1;
  let decOdds = 1;

  parlayLegs.forEach(l => {
    trueProb *= l.trueProb;                // Empire modeled probability
    decOdds *= americanToDecimal(l.price); // Book combined odds
  });

  const impliedProb = 1 / decOdds;
  const edge = trueProb - impliedProb;

  calcEl.innerHTML = `
    <div style="margin-top:10px;color:#fff;">
      <div>
        <strong style="color:var(--gold);">True Hit Rate:</strong>
        ${(trueProb * 100).toFixed(2)}%
      </div>

      <div>
        <strong style="color:var(--gold);">Implied Probability:</strong>
        ${(impliedProb * 100).toFixed(2)}%
      </div>

      <div style="margin-top:6px;">
        <strong style="color:${edge >= 0 ? 'var(--green)' : 'var(--red)'};">
          EV Edge: ${(edge * 100).toFixed(2)}%
        </strong>
      </div>

      <div style="margin-top:6px;color:var(--muted);font-size:0.85rem;">
        Decimal Odds: ${decOdds.toFixed(3)}
      </div>
    </div>
  `;
}
