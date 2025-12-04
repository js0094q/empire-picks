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

   // New way:
events.forEach(event => {
   const cardElement = window.CardComponent.create(event);
   eventsContainer.appendChild(cardElement);
});
      
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
// In dashboard.js

// 4. Integrated Toggle Function
window.toggleBet = function(btn, gameId, team) {
  // 1. Visual Toggle
  btn.classList.toggle('selected');
  
  // 2. Extract Data from DOM
  // We look at the button's children to find the values
  const label = btn.querySelector('.odd-label').innerText; // e.g., "Spread"
  const val = btn.querySelector('.odd-val').innerText;     // e.g., "-110" or "+3.5"
  // Inside dashboard.js -> renderEvents loop
// Add this button somewhere in the card HTML, e.g., after the team rows
<button class="button secondary full-width" 
  onclick="window.LinesPanel.load('${event.id}', '${event.home.name}', '${event.away.name}')">
  View All Wagers & Props >
</button>
  // Find the team name in the same row
  const teamRow = btn.closest('.team-row');
  const teamName = teamRow.querySelector('.team-name').innerText;

  // 3. Create a unique ID for the button so ParlayManager can find it later if needed
  const uniqueId = `${gameId}-${teamName}-${label}`;
  btn.setAttribute('data-bet-id', uniqueId);

  // 4. Send to Parlay Manager
  if (window.ParlayManager) {
    window.ParlayManager.toggle(gameId, teamName, label, val);
  } else {
    console.error("ParlayManager not loaded");
  }
};
