// dashboard.js — main loader for dashboard

document.addEventListener('DOMContentLoaded', () => {
  const eventsContainer = document.getElementById('events-container');

  async function loadEvents() {
    eventsContainer.innerHTML = '<div class="loader">Loading NFL games...</div>';

    try {
      const response = await fetch('/api/events');
      if (!response.ok) throw new Error('API Error');
      const events = await response.json();

      window.AppState.setEvents(events);
      renderEvents(events);
    } catch (error) {
      console.error(error);
      eventsContainer.innerHTML =
        '<div class="error">Failed to load games. Check API Key or quota.</div>';
    }
  }

  function renderEvents(events) {
    eventsContainer.innerHTML = '';

    if (!events || !events.length) {
      eventsContainer.innerHTML = '<div class="muted">No active games found.</div>';
      return;
    }

    events.forEach(event => {
      const cardElement = window.CardComponent.create(event);
      eventsContainer.appendChild(cardElement);
    });
  }

  loadEvents();
});
