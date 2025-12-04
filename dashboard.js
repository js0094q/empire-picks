document.addEventListener("DOMContentLoaded", () => {
  const eventsContainer = document.getElementById("events-container");

  async function loadEvents() {
    eventsContainer.innerHTML = `<div class="loader">Loading NFL games...</div>`;

    const res = await fetch("/api/events");
    const events = await res.json();

    eventsContainer.innerHTML = "";

    events.forEach(ev => {
      const card = window.CardComponent.create(ev);
      eventsContainer.appendChild(card);
    });
  }

  loadEvents();
});
