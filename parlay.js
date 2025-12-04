// parlay.js

const ParlayManager = (function() {
  // State
  let slip = [];
  const slipContainer = document.getElementById('slip-content');
  const placeButton = document.querySelector('.bet-slip .button.primary');

  // Helper: Convert American Odds to Decimal
  function getDecimalOdds(american) {
    const odd = parseFloat(american);
    if (isNaN(odd)) return 1;
    if (odd > 0) {
      return (odd / 100) + 1;
    } else {
      return (100 / Math.abs(odd)) + 1;
    }
  }

  // Helper: Calculate Total Parlay Odds (American format)
  function calculateTotalOdds() {
    if (slip.length === 0) return 0;
    
    // Multiply decimal odds
    const totalDecimal = slip.reduce((acc, bet) => acc * getDecimalOdds(bet.price), 1);
    
    // Convert back to American
    if (totalDecimal >= 2) {
      return Math.round((totalDecimal - 1) * 100);
    } else {
      return Math.round(-100 / (totalDecimal - 1));
    }
  }

  function render() {
    if (!slipContainer) return;

    if (slip.length === 0) {
      slipContainer.innerHTML = '<div class="muted" style="text-align:center; padding: 20px;">Select bets to build your parlay</div>';
      if(placeButton) placeButton.textContent = 'Place Parlay';
      if(placeButton) placeButton.disabled = true;
      return;
    }

    const totalOdds = calculateTotalOdds();
    const formattedTotal = totalOdds > 0 ? `+${totalOdds}` : totalOdds;

    slipContainer.innerHTML = `
      <div class="slip-items">
        ${slip.map(bet => `
          <div class="slip-item" style="margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid rgba(255,255,255,0.1);">
            <div style="display:flex; justify-content:space-between; font-size: 0.9rem; font-weight: 700;">
              <span>${bet.selection}</span>
              <span style="color: var(--accent);">${bet.price}</span>
            </div>
            <div style="display:flex; justify-content:space-between; font-size: 0.8rem; color: var(--muted); margin-top: 4px;">
              <span>${bet.type}</span>
              <button onclick="ParlayManager.remove('${bet.id}')" style="background:none; border:none; color: #ef4444; cursor:pointer;">Remove</button>
            </div>
          </div>
        `).join('')}
      </div>
      <div class="slip-summary" style="margin-top: 16px; padding-top: 16px; border-top: 1px dashed rgba(255,255,255,0.2);">
        <div style="display:flex; justify-content:space-between; margin-bottom: 8px;">
          <span>Selections</span>
          <span>${slip.length}</span>
        </div>
        <div style="display:flex; justify-content:space-between; font-size: 1.1rem; font-weight: 700;">
          <span>Parlay Odds</span>
          <span style="color: var(--success);">${formattedTotal}</span>
        </div>
      </div>
    `;

    if(placeButton) {
      placeButton.textContent = `Bet 100 to win ${Math.floor(100 * (getDecimalOdds(totalOdds) - 1))}`;
      placeButton.disabled = false;
    }
  }

  // Public Methods
  return {
    // Add or Remove a bet
   // In dashboard.js

// 4. Integrated Toggle Function
window.toggleBet = function(btn, gameId, team) {
  // 1. Visual Toggle
  btn.classList.toggle('selected');
  
  // 2. Extract Data from DOM
  // We look at the button's children to find the values
  const label = btn.querySelector('.odd-label').innerText; // e.g., "Spread"
  const val = btn.querySelector('.odd-val').innerText;     // e.g., "-110" or "+3.5"
  
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

// Expose to window so HTML can access it
window.ParlayManager = ParlayManager;
