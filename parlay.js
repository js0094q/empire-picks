// parlay.js — parlay builder

window.addLeg = function (_, eventId, label, value) {
  const id = `${eventId}-${label}-${value}`;

  window.AppState.addParlayLeg({
    id,
    eventId,
    label,
    value
  });

  renderParlaySlip();
};

window.removeParlay = function (id) {
  window.AppState.removeParlayLeg(id);
  renderParlaySlip();
};

document.addEventListener('DOMContentLoaded', () => {
  const placeBtn = document.getElementById('place-parlay');
  if (placeBtn) {
    placeBtn.onclick = () => {
      const slip = window.AppState.parlay;
      if (!slip.length) {
        alert('No legs selected.');
        return;
      }
      alert(`Parlay placed with ${slip.length} legs! (EV engine next)`);
    };
  }
});
