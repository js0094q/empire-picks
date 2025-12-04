// card.js
const CardComponent = {
  create(event) {
    const card = document.createElement('div');
    card.className = 'game-card';
    
    // Determine if we have odds to display on the card
    const homeSpread = event.odds?.home || '-';
    const awaySpread = event.odds?.away || '-';

    card.innerHTML = `
      <div class="game-header">
        <span class="league-badge">${event.league}</span>
        <span class="game-status">${event.time}</span>
      </div>
      
      <div class="team-row">
        <span class="team-name">${event.away.name}</span>
        <div class="score-area">${event.away.score}</div>
        <div class="odds-group">
          <button class="odd-btn" onclick="window.toggleBet(this, '${event.id}', '${event.away.name} Spread')">
            <span class="odd-label">Spread</span>
            <span class="odd-val">${awaySpread}</span>
          </button>
        </div>
      </div>

      <div class="team-row">
        <span class="team-name">${event.home.name}</span>
        <div class="score-area">${event.home.score}</div>
        <div class="odds-group">
          <button class="odd-btn" onclick="window.toggleBet(this, '${event.id}', '${event.home.name} Spread')">
            <span class="odd-label">Spread</span>
            <span class="odd-val">${homeSpread}</span>
          </button>
        </div>
      </div>

      <div style="margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,255,255,0.05);">
        <button class="button secondary full-width" 
          onclick="window.LinesPanel.load('${event.id}', '${event.home.name}', '${event.away.name}')">
          View All Wagers & Props >
        </button>
      </div>
    `;

    return card;
  }
};

window.CardComponent = CardComponent;
