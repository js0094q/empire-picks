// ============================================================
// parlay.js — EmpirePicks v1.0
// ============================================================

import { renderParlaySlip } from "./ui.js";

window.addLeg = function (_, eventId, label, value) {
  const id = `${eventId}-${label}-${value}`;
  renderParlaySlip();
};

window.removeParlay = function (id) {
  window.AppState.removeParlayLeg(id);
  renderParlaySlip();
};

// "Place Parlay" button
document.addEventListener("DOMContentLoaded", () => {
  const placeBtn = document.getElementById("place-parlay");
  if (placeBtn) {
    placeBtn.onclick = () => {
      const slip = window.AppState.parlay;
      if (!slip.length) return alert("No legs selected.");

      alert(`Parlay placed with ${slip.length} legs! (EV analytics coming soon)`);
    };
  }
});
