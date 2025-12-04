// linesPanel.js — ML + Totals

const LinesPanel = {
  async show(eventId, btn) {
    const tabs = btn.parentElement.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    const linesBox = document.getElementById(`lines-${eventId}`);
    const propsBox = document.getElementById(`props-${eventId}`);

    linesBox.style.display = 'block';
    propsBox.style.display = 'none';
    linesBox.innerHTML = `<div class="loader">Loading lines...</div>`;

    try {
      const res = await fetch(`/api/odds?eventId=${eventId}`);
      if (!res.ok) throw new Error('Failed odds');
      const data = await res.json();
      const game = data[0];

      const homeML = game.odds?.h2h?.home || '-';
      const awayML = game.odds?.h2h?.away || '-';
      const pts = game.odds?.totals?.points || '-';
      const over = game.odds?.totals?.over || '-';
      const under = game.odds?.totals?.under || '-';

      const pHome = impliedProbability(homeML);
      const pAway = impliedProbability(awayML);
      const nv = removeVig(pHome || 0.5, pAway || 0.5);
      const evHome = expectedValue(homeML, nv.a);
      const evAway = expectedValue(awayML, nv.b);

      linesBox.innerHTML = `
        <h3>Moneyline</h3>
        <div class="team-row">
          <span>${game.home_team}</span>
          <button class="odd-btn" onclick="addLeg(null,'${eventId}','Home ML','${homeML}')">
            ${homeML} ${evBadge(evHome)}
          </button>
        </div>
        <div class="team-row">
          <span>${game.away_team}</span>
          <button class="odd-btn" onclick="addLeg(null,'${eventId}','Away ML','${awayML}')">
            ${awayML} ${evBadge(evAway)}
          </button>
        </div>

        <hr style="border-color:rgba(255,255,255,0.1); margin:16px 0;">

        <h3>Totals</h3>
        <div class="team-row">
          <button class="odd-btn" onclick="addLeg(null,'${eventId}','Over ${pts}','${over}')">
            Over ${fmt(pts)} (${fmt(over)})
          </button>
          <button class="odd-btn" onclick="addLeg(null,'${eventId}','Under ${pts}','${under}')">
            Under ${fmt(pts)} (${fmt(under)})
          </button>
        </div>
      `;
    } catch (e) {
      console.error(e);
      linesBox.innerHTML = `<div class="muted">Failed to load lines.</div>`;
    }
  }
};

window.LinesPanel = LinesPanel;
