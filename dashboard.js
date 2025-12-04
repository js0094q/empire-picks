// dashboard.js

document.addEventListener('DOMContentLoaded', () => {
  const eventsContainer = document.getElementById('events-container');

  async function loadEvents() {
    if (!eventsContainer) return;
    
    // Show loading state
    eventsContainer.innerHTML = '<div class="loader">Loading live odds...</div>';

    try {
      // Fetch from our new Vercel API route
      const response = await fetch('/api/events');
      if (!response.ok) throw new Error('API Error');
      
      const events = await response.json();
      renderEvents(events);
    } catch (error) {
      console.error(error);
      eventsContainer.innerHTML = '<div class="error">Failed to load games. Check API Key or Quota.</div>';
    }
  }

  function renderEvents(events) {
    eventsContainer.innerHTML = '';

    if (events.length === 0) {
      eventsContainer.innerHTML = '<div class="muted">No active games found.</div>';
      return;
    }

    events.forEach(event => {
      const card = document.createElement('div');
      card.className = 'game-card';
      
      card.innerHTML = `
        <div class="game-header">
          <span class="league-badge">${event.league}</span>
          <span class="game-status">${event.time}</span>
        </div>
        
        <div class="team-row">
          <span class="team-name">${event.away.name}</span>
          <div class="score-area">${event.away.score}</div>
          <div class="odds-group">
            <button class="odd-btn" onclick="toggleBet(this, '${event.id}', 'away')">
              <span class="odd-label">Spread</span>
              <span class="odd-val">${event.odds.away}</span>
            </button>
          </div>
        </div>

        <div class="team-row">
          <span class="team-name">${event.home.name}</span>
          <div class="score-area">${event.home.score}</div>
          <div class="odds-group">
            <button class="odd-btn" onclick="toggleBet(this, '${event.id}', 'home')">
              <span class="odd-label">Spread</span>
              <span class="odd-val">${event.odds.home}</span>
            </button>
          </div>
        </div>
      `;
      eventsContainer.appendChild(card);
    });
  }

  // Initial Load
  loadEvents();
});

// Simple toggle function for UI interaction
window.toggleBet = function(btn, gameId, team) {
  btn.classList.toggle('selected');
  console.log(`Bet toggled: Game ${gameId}, Team ${team}`);
  // Future: Add logic here to call 'parlay.js' to add to slip
};
