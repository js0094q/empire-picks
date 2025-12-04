// ============================================================
// dashboard.js — EmpirePicks v1.0
// Loads events + renders cards using the premium UI system
// ============================================================

document.addEventListener("DOMContentLoaded", () => {
  const eventsContainer = document.getElementById("events-container");

  async function loadEvents() {
    eventsContainer.innerHTML = `<div class="loader">Loading NFL games...</div>`;

    try {
      const res = await fetch("/api/events");
      if (!res.ok) throw new Error("Failed to fetch events");

      const events = await res.json();
      renderEvents(events);
    } catch (err) {
      console.error(err);
      eventsContainer.innerHTML = `<div class="error">Unable to load games. Check API key or quota.</div>`;
    }
  }

  function renderEvents(events) {
    eventsContainer.innerHTML = "";

    if (!events || events.length === 0) {
      eventsContainer.innerHTML = `<div class="muted">No active games.</div>`;
      return;
    }

    events.forEach(ev => {
      const card = window.CardComponent.create(ev);
      eventsContainer.appendChild(card);
    });
  }

  loadEvents();
});

// =================================================================
// SIMPLE BET TOGGLE -> now replaced by addLeg() in parlay.js
// =================================================================

window.toggleBet = function () {
  // kept only for compatibility — no longer used
  console.warn("toggleBet() is deprecated in v1.0. Use addLeg().");
};
