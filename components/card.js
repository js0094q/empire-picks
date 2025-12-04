import { toggleAccordion } from "./ui.js";
import { LinesPanel } from "./linesPanel.js";
import { PropsPanel } from "./propsPanel.js";

export const CardComponent = {
  create(event) {
    const card = document.createElement("div");
    card.className = "game-card";

    card.innerHTML = `
      <div class="game-header" onclick="toggleAccordion(this.parentElement)">
        <span>${event.away.name} @ ${event.home.name}</span>
        <span>${event.time}</span>
      </div>

      <div class="team-row">
        <span class="team-name">${event.away.name}</span>
        <span>${event.odds.away}</span>
      </div>

      <div class="team-row">
        <span class="team-name">${event.home.name}</span>
        <span>${event.odds.home}</span>
      </div>

      <div class="card-expanded">
        <div class="panel-tabs">
          <button class="tab-btn active" onclick="LinesPanel.show('${event.id}', this)">Lines</button>
          <button class="tab-btn" onclick="PropsPanel.show('${event.id}', this)">Props</button>
        </div>

        <div class="tab-content" id="lines-${event.id}">
          <div class="loader">Loading lines...</div>
        </div>

        <div class="tab-content" id="props-${event.id}" style="display:none">
          <div class="loader">Loading props...</div>
        </div>
      </div>
    `;

    return card;
  }
};

window.CardComponent = CardComponent;
