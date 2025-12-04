// linesPanel.js
const LinesPanel = {
  
  async load(gameId, homeTeam, awayTeam) {
    // 1. Setup specific UI for the modal
    const container = document.createElement('div');
    
    // Add Tabs
    container.innerHTML = `
      <div class="panel-tabs">
        <button class="tab-btn active" onclick="LinesPanel.switchTab('lines')">Game Lines</button>
        <button class="tab-btn" onclick="LinesPanel.switchTab('props')">Player Props</button>
      </div>
      <div id="panel-content-lines" class="tab-content">
        <div class="loader">Loading lines...</div>
      </div>
      <div id="panel-content-props" class="tab-content" style="display:none">
        <div class="loader">Loading props...</div>
      </div>
    `;

    // Open the Modal immediately with loaders
    window.Modal.openElement(`${awayTeam} @ ${homeTeam}`, container);

    // 2. Fetch Data in background
    this.fetchLines(gameId);
    this.fetchProps(gameId);
  },

  switchTab(tabName) {
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    document.getElementById(`panel-content-${tabName}`).style.display = 'block';
    // Find the button that called this (hacky but works for simple JS)
    const buttons = document.querySelectorAll('.tab-btn');
    if(tabName === 'lines') buttons[0].classList.add('active');
    else buttons[1].classList.add('active');
  },

  async fetchLines(gameId) {
    const container = document.getElementById('panel-content-lines');
    try {
      const res = await fetch(`/api/odds?eventId=${gameId}`);
      const data = await res.json();
      const game = data[0]; // api returns array

      if (!game || !game.odds) throw new Error('No odds found');

      // Helper to render a bet button
      const renderBtn = (label, val, type) => `
        <button class="odd-btn" onclick="window.toggleBet(this, '${gameId}', '${label}')">
          <span class="odd-label">${label}</span>
          <span class="odd-val">${val || '-'}</span>
        </button>
      `;

      container.innerHTML = `
        <div class="card" style="background: rgba(255,255,255,0.03);">
          <h4>Moneyline</h4>
          <div style="display:flex; gap:10px; margin-bottom: 20px;">
             ${renderBtn('Home Moneyline', game.odds.h2h.home, 'moneyline')}
             ${renderBtn('Away Moneyline', game.odds.h2h.away, 'moneyline')}
          </div>

          <h4>Total Points: ${game.odds.totals.points || '-'}</h4>
          <div style="display:flex; gap:10px;">
             ${renderBtn('Over', game.odds.totals.over, 'total')}
             ${renderBtn('Under', game.odds.totals.under, 'total')}
          </div>
        </div>
      `;
    } catch (e) {
      container.innerHTML = `<div class="muted">Lines currently unavailable.</div>`;
    }
  },

  async fetchProps(gameId) {
    const container = document.getElementById('panel-content-props');
    try {
      // Calls your api/props.js
      const res = await fetch(`/api/props?eventId=${gameId}`);
      const data = await res.json();
      
      if (data.error || !data.bookmakers) {
        container.innerHTML = `<div class="muted">No player props available for this game.</div>`;
        return;
      }

      // Filter for DraftKings or FanDuel
      const bookmaker = data.bookmakers.find(b => b.key === 'draftkings') || data.bookmakers[0];
      
      let html = '';
      
      // Loop through markets (Passing Yards, TDs, etc.)
      bookmaker.markets.forEach(market => {
        html += `<h4 style="margin: 20px 0 10px; color:var(--accent)">${market.key.replace(/_/g, ' ').toUpperCase()}</h4>`;
        
        market.outcomes.forEach(outcome => {
          html += `
            <div class="prop-row">
              <span>${outcome.description}</span>
              <div class="odds-group">
                 <button class="odd-btn" style="min-width:60px; padding:4px 8px;" 
                   onclick="window.toggleBet(this, '${gameId}', '${outcome.description} (${market.key})')">
                   <span class="odd-val">${outcome.point ? 'Over ' + outcome.point : ''}</span>
                   <span class="odd-label">${outcome.price}</span>
                 </button>
              </div>
            </div>
          `;
        });
      });

      container.innerHTML = html;

    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="muted">Failed to load props.</div>`;
    }
  }
};

window.LinesPanel = LinesPanel;
