// parlay.js

if (!localStorage.getItem("parlay_legs")) {
  localStorage.setItem("parlay_legs", JSON.stringify([]));
}

export function getParlay() {
  try {
    return JSON.parse(localStorage.getItem("parlay_legs") || "[]");
  } catch {
    return [];
  }
}

export function saveParlay(legs) {
  localStorage.setItem("parlay_legs", JSON.stringify(legs));
  const countEl = document.getElementById("parlay-count");
  if (countEl) countEl.innerText = legs.length;
}

export function addParlayLeg(leg) {
  const legs = getParlay();
  legs.push(leg);
  saveParlay(legs);
  console.log("Parlay leg added:", leg);
}

export function clearParlay() {
  saveParlay([]);
}

window.addParlayLeg = addParlayLeg;
window.clearParlay = clearParlay;
