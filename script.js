// script.js
document.addEventListener('DOMContentLoaded', () => {
  // If user is already logged in, redirect them to dashboard immediately
  if (window.Auth && window.Auth.isLoggedIn()) {
    window.location.href = '/dashboard.html';
  }
});

  // 1. Mock Data (This simulates what your api/events.js would return)
  const mockEvents = [
    {
      id: 1,
      league: 'NFL',
      status: 'Live',
      time: 'Q3 12:45',
      home: { name: 'Kansas City Chiefs', score: 24 },
      away: { name: 'Buffalo Bills', score: 21 },
      odds: { home: '-140', away: '+120', spread: '-3.5' }
    },
    {
      id: 2,
      league: 'NBA',
      status: 'Upcoming',
      time: 'Tonight 8:00 PM',
      home: { name: 'Lakers', score: '-' },
      away: { name: 'Warriors', score: '-' },
      odds: { home: '-110', away: '-110', spread: '-1.5' }
    }
  ];

  // 2. Render Function
  function renderEvents(events) {
    if (!eventsContainer) return;
    eventsContainer.innerHTML = '';

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
            <button class="odd-btn" onclick="toggleBet(this)">
              <span class="odd-label">Spread</span>
              <span class="odd-val">${event.odds.away}</span>
            </button>
          </div>
        </div>

        <div class="team-row">
          <span class="team-name">${event.home.name}</span>
          <div class="score-area">${event.home.score}</div>
          <div class="odds-group">
            <button class="odd-btn" onclick="toggleBet(this)">
              <span class="odd-label">Spread</span>
              <span class="odd-val">${event.odds.home}</span>
            </button>
          </div>
        </div>
      `;
      eventsContainer.appendChild(card);
    });
  }

  // 3. Initial Load
  renderEvents(mockEvents);
});

// 4. Simple toggle function for UI interaction
window.toggleBet = function(btn) {
  btn.classList.toggle('selected');
  // In the future, this will call 'parlay.js' to add to the slip
};
