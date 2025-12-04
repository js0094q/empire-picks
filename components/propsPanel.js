// propsPanel.js
const PropsPanel = {
  
  async init(gameId, containerId) {
    const container = document.getElementById(containerId);
    
    try {
      // Fetch from your backend API
      const res = await fetch(`/api/props?eventId=${gameId}`);
      const data = await res.json();
      
      if (data.error || !data.bookmakers || data.bookmakers.length === 0) {
        container.innerHTML = `<div class="muted" style="text-align:center; padding:20px;">No player props available for this game right now.</div>`;
        return;
      }

      // We prioritize DraftKings, then FanDuel, then fallback to first available
      const bookmaker = data.bookmakers.find(b => b.key === 'draftkings') 
                     || data.bookmakers.find(b => b.key === 'fanduel') 
                     || data.bookmakers[0];
      
      let html = '';
      
      // Group props by market key (e.g., "player_pass_yds", "player_touchdowns")
      bookmaker.markets.forEach(market => {
        const title = market.key.replace(/_/g, ' ').replace('player', '').trim().toUpperCase();
        
        html += `
          <div class="card" style="background: rgba(255,255,255,0.03); margin-bottom: 12px; padding: 12px;">
            <h4 style="margin: 0 0 12px; color:var(--accent); font-size: 0.9rem;">${title}</h4>
        `;
        
        market.outcomes.forEach(outcome => {
          const line = outcome.point ? `Over ${outcome.point}` : 'Yes';
          
          html += `
            <div class="prop-row" style="display:flex; justify-content:space-between; align-items:center; padding: 8px 0; border-bottom:1px solid rgba(255,255,255,0.05);">
              <span style="font-weight:600; font-size:0.95rem;">${outcome.description}</span>
              <button class="odd-btn" style="min-width:70px; padding:6px;" 
                 onclick="window.toggleBet(this, '${gameId}', '${outcome.description} (${title})')">
                 <span class="odd-val">${line}</span>
                 <span class="odd-label" style="font-size:0.75rem;">${outcome.price}</span>
              </button>
            </div>
          `;
        });
        
        html += `</div>`;
      });

      container.innerHTML = html;

    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="muted">Failed to load props.</div>`;
    }
  }
};

window.PropsPanel = PropsPanel;
