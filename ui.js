// ============================================================
// ui.js — EmpirePicks v1.0 UI Utility Library
// Controls accordions, transitions, EV badges, and DOM helpers
// ============================================================

import { formatEV } from './helpers.js';

// Toggle accordion expansion on cards
export function toggleAccordion(cardEl) {
  const body = cardEl.querySelector('.card-expanded');
  const isOpen = body.classList.contains('open');

  if (isOpen) {
    body.classList.remove('open');
    body.style.maxHeight = "0px";
  } else {
    body.classList.add('open');
    body.style.maxHeight = body.scrollHeight + "px";
  }
}

// Generate EV badge HTML
export function evBadge(ev) {
  const { text, cls } = formatEV(ev);
  if (!cls) return '';
  return `<span class="${cls}">${text}</span>`;
}

// Build a DOM element from HTML string
export function el(html) {
  const template = document.createElement("template");
  template.innerHTML = html.trim();
  return template.content.firstChild;
}

// Smoothly update parlay slip
export function renderParlaySlip() {
  const container = document.getElementById('parlay-items');
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

// Expose globally for handlers
window.toggleAccordion = toggleAccordion;
window.renderParlaySlip = renderParlaySlip;
