// linesPanel.js
const LinesPanel = {
  
  async load(gameId, homeTeam, awayTeam) {
    // 1. Setup specific UI for the modal
    const container = document.createElement('div');
    
    // HTML Structure with Tabs
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

    // Open the Modal
    window.Modal.openElement(`${awayTeam} @ ${homeTeam}`, container);

    // 2. Fetch Data
    this.fetchLines(gameId);
    
    // 3. Delegate Props fetching to the PropsPanel component
    if (window.PropsPanel) {
      window.PropsPanel.init(gameId, 'panel-content-props');
    }
  },

  switchTab(tabName) {
    // Hide all contents
    document.querySelectorAll('.tab-content').forEach(el => el.style.display = 'none');
    // Deactivate all buttons
    document.querySelectorAll('.tab-btn').forEach(btn => btn.classList.remove('active'));
    
    // Show selected content
    document.getElementById(`panel-content-${tabName}`).style.display = 'block';
    
    // Activate selected button (Simple logic based on text)
    const buttons = document.querySelectorAll('.tab-btn');
    if (tabName === 'lines') buttons[0].classList.add('active');
    else buttons[1].classList.add('active');
  },

  async fetchLines(gameId) {
    const container = document.getElementById('panel-content-lines');
    try {
      const res = await fetch(`/api/odds?eventId=${gameId}`);
      if (!res.ok) throw new Error('API Error');
      
      const data = await res.json();
      const game = data[0]; // api returns array

      if (!game || !game.odds) throw new Error('No odds found');

      // Helper for buttons
      const renderBtn = (label, val, type) => `
        <button class="odd-btn" style="flex:1" onclick="window.toggleBet(this, '${gameId}', '${label}')">
          <span class="odd-label">${label}</span>
          <span class="odd-val">${val || '-'}</span>
        </button>
      `;

      container.innerHTML = `
        <div class="card" style="background: rgba(255,255,255,0.03); margin-bottom: 16px;">
          <h4 style="margin-top:0; color:var(--accent)">Moneyline (Winner)</h4>
          <div style="display:flex; gap:10px; margin-bottom: 20px;">
             ${renderBtn('Home Moneyline', game.odds.h2h.home, 'moneyline')}
             ${renderBtn('Away Moneyline', game.odds.h2h.away, 'moneyline')}
          </div>

          <h4 style="margin-top:0; color:var(--accent)">Total Points: ${game.odds.totals.points || '-'}</h4>
          <div style="display:flex; gap:10px;">
             ${renderBtn('Over', game.odds.totals.over, 'total')}
             ${renderBtn('Under', game.odds.totals.under, 'total')}
          </div>
        </div>
      `;
    } catch (e) {
      console.error(e);
      container.innerHTML = `<div class="muted">Lines currently unavailable.</div>`;
    }
  }
};

window.LinesPanel = LinesPanel;
