export const LinesPanel = {
  async show(eventId, btn) {
    const parent = btn.parentElement.querySelectorAll(".tab-btn");
    parent.forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    document.getElementById(`lines-${eventId}`).style.display = "block";
    document.getElementById(`props-${eventId}`).style.display = "none";

    const box = document.getElementById(`lines-${eventId}`);
    const res = await fetch(`/api/odds?eventId=${eventId}`);
    const data = await res.json();

    const game = data[0];

    box.innerHTML = `
      <div class="team-row">
        <span>${game.home_team}</span>
        <button class="odd-btn" onclick="addLeg(null,'${eventId}','Home ML','${game.odds.h2h.home}')">
          ${game.odds.h2h.home}
        </button>
      </div>

      <div class="team-row">
        <span>${game.away_team}</span>
        <button class="odd-btn" onclick="addLeg(null,'${eventId}','Away ML','${game.odds.h2h.away}')">
          ${game.odds.h2h.away}
        </button>
      </div>
    `;
  }
};

window.LinesPanel = LinesPanel;
