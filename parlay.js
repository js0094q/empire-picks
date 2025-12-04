// ============================================================
// parlay.js — EmpirePicks v1.0 (Fixed + Fully Functional)
// ============================================================

import { renderParlaySlip } from "./ui.js";

// Add a leg to the parlay slip
window.addLeg = function (_, eventId, label, value) {
  const id = `${eventId}-${label}-${value}`;

  // Add to AppState with duplicate protection
  window.AppState.addParlayLeg({
    id,
    eventId,
    label,
    value
  });

  renderParlaySlip();
};

// Remove a leg from the parlay
window.removeParlay = function (id) {
  window.AppState.removeParlayLeg(id);
  renderParlaySlip();
};

// "Place Parlay" button handler
document.addEventListener("DOMContentLoaded", () => {
  const placeBtn = document.getElementById("place-parlay");
  
  if (placeBtn) {
    placeBtn.onclick = () => {
      const slip = window.AppState.parlay;

      if (!slip.length) {
        alert("No legs selected.");
        return;
      }

      alert(`Parlay placed with ${slip.length} legs! (EV engine activates in v1.1)`);
    };
  }
});
