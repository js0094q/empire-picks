// parlay.js — very simple global parlay slip

(function () {
  const itemsEl = document.getElementById("parlay-items");
  const slipEl = document.getElementById("parlay-slip");
  const placeBtn = document.getElementById("place-parlay");

  const legs = [];

  function render() {
    if (!itemsEl) return;
    if (!legs.length) {
      itemsEl.classList.add("muted");
      itemsEl.innerHTML = "No picks added";
      return;
    }
    itemsEl.classList.remove("muted");
    itemsEl.innerHTML = legs
      .map(
        (l, idx) =>
          `<div class="parlay-leg">
            <span>${l.game} – <strong>${l.label}</strong> ${l.odds}</span>
            <button data-i="${idx}" class="parlay-remove">×</button>
          </div>`
      )
      .join("");
    itemsEl.querySelectorAll(".parlay-remove").forEach(btn => {
      btn.onclick = () => {
        const i = parseInt(btn.dataset.i, 10);
        legs.splice(i, 1);
        render();
      }
    });
  }

  function addLeg(leg) {
    legs.push(leg);
    render();
  }

  if (placeBtn) {
    placeBtn.onclick = () => {
      if (!legs.length) {
        alert("Add at least one leg first.");
        return;
      }
      alert("This is a demo. In production, this would export your slip.");
    };
  }

  // Expose
  window.Parlay = {
    addLeg,
    getLegs() { return legs.slice(); }
  };

  render();
})();
