// ============================================================
// linesPanel.js — EmpirePicks v1.0
// ============================================================

import { impliedProbability, removeVig, expectedValue, fmt } from "./helpers.js";
import { evBadge } from "./ui.js";

export const LinesPanel = {
  async show(eventId, btn) {
    // Switch tab UI
    const tabs = btn.parentElement.querySelectorAll(".tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    document.getElementById(`lines-${eventId}`).style.display = "block";
    document.getElementById(`props-${eventId}`).style.display = "none";

    // Fetch
    const box = document.getElementById(`lines-${eventId}`);
    box.innerHTML = `<div class="loader">Loading lines...</div>`;

    const res = await fetch(`/api/odds?eventId=${eventId}`);
    const data = await res.json();
    const game = data[0];

    if (!game || !game.odds) {
      box.innerHTML = `<div class="muted">Lines unavailable.</div>`;
      return;
    }

    const home = game.odds.h2h.home;
    const away = game.odds.h2h.away;

    // EV math
    const pHome = impliedProbability(home);
    const pAway = impliedProbability(away);
    const nv = removeVig(pHome, pAway);

    const evHome = expectedValue(home, nv.a);
    const evAway = expectedValue(away, nv.b);

    box.innerHTML = `
      <h3>Moneyline</h3>

      <div style="margin-top:10px;">
        <div class="team-row">
          <span>${game.home_team}</span>
          <button class="odd-btn" onclick="window.addLeg(null,'${eventId}','Home ML','${home}')">
            ${home} ${evBadge(evHome)}
          </button>
        </div>

        <div class="team-row">
          <span>${game.away_team}</span>
          <button class="odd-btn" onclick="window.addLeg(null,'${eventId}','Away ML','${away}')">
            ${away} ${evBadge(evAway)}
          </button>
        </div>
      </div>

      <hr style="border-color:rgba(255,255,255,0.1); margin:16px 0;">

      <h3>Totals</h3>
      <div class="team-row">
        <button class="odd-btn" onclick="window.addLeg(null,'${eventId}','Over ${game.odds.totals.points}','${game.odds.totals.over}')">
          Over ${fmt(game.odds.totals.points)} (${fmt(game.odds.totals.over)})
        </button>
        <button class="odd-btn" onclick="window.addLeg(null,'${eventId}','Under ${game.odds.totals.points}','${game.odds.totals.under}')">
          Under ${fmt(game.odds.totals.points)} (${fmt(game.odds.totals.under)})
        </button>
      </div>
    `;
  }
};

window.LinesPanel = LinesPanel;
