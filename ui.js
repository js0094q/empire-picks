// ui.js — accordion + parlay rendering + EV badge

function toggleAccordion(cardEl) {
  const body = cardEl.querySelector('.card-expanded');
  if (!body) return;
  const isOpen = body.classList.contains('open');

  if (isOpen) {
    body.classList.remove('open');
    body.style.maxHeight = '0px';
  } else {
    body.classList.add('open');
    body.style.maxHeight = body.scrollHeight + 'px';
  }
}

function evBadge(ev) {
  if (ev === null || ev === undefined) return '';
  const pct = (ev * 100).toFixed(1);
  let cls = 'ev-badge ev-neutral';

  if (ev >= 0.03) cls = 'ev-badge ev-pos';
  else if (ev < -0.01) cls = 'ev-badge ev-neg';

  return `<span class="${cls}">${ev >= 0 ? '+' : ''}${pct}%</span>`;
}

function renderParlaySlip() {
  const container = document.getElementById('parlay-items');
  if (!container) return;

  const list = window.AppState.parlay;
  if (!list.length) {
    container.innerHTML = `<span class="muted">No picks added</span>`;
    return;
  }

  container.innerHTML = list
    .map(
      leg => `
      <div class="parlay-item">
        <strong>${leg.label}</strong> — ${leg.value}
        <span class="parlay-remove" onclick="removeParlay('${leg.id}')">×</span>
      </div>`
    )
    .join('');
}

window.toggleAccordion = toggleAccordion;
window.evBadge = evBadge;
window.renderParlaySlip = renderParlaySlip;
