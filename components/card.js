// ============================================================
// card.js — EmpirePicks v1.0
// Premium Accordion Game Cards with DraftKings Theme
// ============================================================

import { toggleAccordion } from "./ui.js";
import { LinesPanel } from "./linesPanel.js";
import { PropsPanel } from "./propsPanel.js";

export const CardComponent = {
  create(event) {
    const homeAssets = window.TeamAssets.get(event.home.name);
    const awayAssets = window.TeamAssets.get(event.away.name);

    const card = document.createElement("div");
    card.className = "game-card";

    card.innerHTML = `
      <div class="team-bar" style="background:${homeAssets.color}"></div>

      <div class="game-header" onclick="toggleAccordion(this.parentElement)">
        <span>${event.away.name} @ ${event.home.name}</span>
        <span>${event.time}</span>
      </div>

      <div class="team-row">
        <span class="team-name">${event.away.name}</span>
        <span class="score-area">-</span>
        <div class="odds-group">
          <button class="odd-btn" 
            onclick="window.addLeg(event,'${event.id}','Spread','${event.odds.away}')">
            ${event.odds.away}
          </button>
        </div>
      </div>

      <div class="team-row">
        <span class="team-name">${event.home.name}</span>
        <span class="score-area">-</span>
        <div class="odds-group">
          <button class="odd-btn"
            onclick="window.addLeg(event,'${event.id}','Spread','${event.odds.home}')">
            ${event.odds.home}
          </button>
        </div>
      </div>

      <!-- EXPANDING CARD BODY -->
      <div class="card-expanded">
        <div class="panel-tabs">
          <button class="tab-btn active" onclick="LinesPanel.show('${event.id}', this)">Lines</button>
          <button class="tab-btn" onclick="PropsPanel.show('${event.id}', this)">Props</button>
        </div>

        <div class="tab-content" id="lines-${event.id}">
          <div class="loader">Loading lines...</div>
        </div>

        <div class="tab-content" id="props-${event.id}" style="display:none;">
          <div class="loader">Loading props...</div>
        </div>
      </div>
    `;

    return card;
  }
};

window.CardComponent = CardComponent;
