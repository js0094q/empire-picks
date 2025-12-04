export function toggleAccordion(card) {
  const panel = card.querySelector(".card-expanded");
  if (!panel) return;
  panel.classList.toggle("open");
  panel.style.maxHeight = panel.classList.contains("open")
    ? panel.scrollHeight + "px"
    : "0px";
}

export function renderParlaySlip() {
  const cont = document.getElementById("parlay-items");
  const slip = window.AppState.parlay;

  if (!slip.length) {
    cont.innerHTML = `<span class="muted">No picks added</span>`;
    return;
  }

  cont.innerHTML = slip
    .map(
      leg => `
      <div class="parlay-item">
        <strong>${leg.label}</strong> — ${leg.value}
        <span class="parlay-remove" onclick="removeParlay('${leg.id}')">×</span>
      </div>`
    )
    .join("");
}

window.toggleAccordion = toggleAccordion;
window.renderParlaySlip = renderParlaySlip;
