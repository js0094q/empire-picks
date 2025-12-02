// ========================================================
// PARLAY ENGINE (FINAL PRODUCTION VERSION)
// ========================================================

// Parlay slip array
let parlaySlip = [];

// Register UI container if it exists
const slipContainer = document.getElementById("parlay-slip");
const slipList = document.getElementById("parlay-legs");
const slipPayout = document.getElementById("parlay-payout");

// Convert American odds to decimal
function americanToDecimal(odds) {
  if (odds > 0) return 1 + odds / 100;
  return 1 - 100 / odds;
}

// Compute parlay payout
function computeParlayPayout() {
  if (parlaySlip.length === 0) return 0;

  let decimal = 1;
  parlaySlip.forEach(l => {
    decimal *= americanToDecimal(l.odds);
  });

  return decimal;
}

// Render slip UI
function renderSlip() {
  if (!slipList) return;

  slipList.innerHTML = "";

  parlaySlip.forEach((leg, idx) => {
    const li = document.createElement("li");
    li.className = "parlay-leg-item";
    li.innerHTML = `
      <div class="leg-line">${leg.display}</div>
      <button class="remove-leg" data-index="${idx}">✕</button>
    `;
    slipList.appendChild(li);
  });

  const payout = computeParlayPayout();
  if (slipPayout) {
    slipPayout.innerHTML = payout.toFixed(2);
  }

  // Remove listeners
  document.querySelectorAll(".remove-leg").forEach(btn => {
    btn.onclick = e => {
      const idx = parseInt(e.target.dataset.index, 10);
      parlaySlip.splice(idx, 1);
      renderSlip();
    };
  });
}

// ========================================================
// REAL addParlayLeg implementation
// ========================================================
window.addParlayLeg = function addParlayLeg(leg) {
  parlaySlip.push(leg);
  renderSlip();
};

// ========================================================
// IMPORT ANY LEGS THAT UI CLICKED BEFORE parlay.js LOADED
// ========================================================
if (window._pendingParlayLegs && window._pendingParlayLegs.length > 0) {
  console.log(
    "Importing pending legs stored before parlay.js initialization:",
    window._pendingParlayLegs
  );

  window._pendingParlayLegs.forEach(leg => {
    addParlayLeg(leg);
  });

  window._pendingParlayLegs = [];
}
