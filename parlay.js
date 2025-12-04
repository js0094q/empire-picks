// parlay.js
// Global parlay system — persistent & cross-page

if (!localStorage.getItem("parlay_legs")) {
  localStorage.setItem("parlay_legs", JSON.stringify([]));
}

export function getParlay() {
  return JSON.parse(localStorage.getItem("parlay_legs") || "[]");
}

export function saveParlay(legs) {
  localStorage.setItem("parlay_legs", JSON.stringify(legs));
  const count = document.getElementById("parlay-count");
  if (count) count.innerText = legs.length;
}

// ADD A LEG
export function addParlayLeg(leg) {
  const legs = getParlay();
  legs.push(leg);
  saveParlay(legs);
  console.log("Added parlay leg:", leg);
}

// CLEAR PARLAY
export function clearParlay() {
  saveParlay([]);
}

// Make available globally
window.addParlayLeg = addParlayLeg;
window.clearParlay = clearParlay;

// Update pill count on load
document.addEventListener("DOMContentLoaded", () => {
  saveParlay(getParlay());
});
