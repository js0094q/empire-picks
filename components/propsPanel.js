export const PropsPanel = {
  async show(eventId, btn) {
    const tabs = btn.parentElement.querySelectorAll(".tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    document.getElementById(`lines-${eventId}`).style.display = "none";
    document.getElementById(`props-${eventId}`).style.display = "block";

    const box = document.getElementById(`props-${eventId}`);
    const res = await fetch(`/api/props?eventId=${eventId}`);
    const data = await res.json();

    if (!data || !data.bookmakers) {
      box.innerHTML = `<div class="muted">No props available.</div>`;
      return;
    }

    const dk = data.bookmakers.find(b => b.key === "draftkings") || data.bookmakers[0];

    box.innerHTML = dk.markets
      .map(
        m =>
          m.outcomes
            .map(
              o => `
        <div class="team-row">
          <span>${o.description}</span>
          <button class="odd-btn" onclick="addLeg(null,'${eventId}','${o.description}','${o.price}')">
            ${o.price}
          </button>
        </div>`
            )
            .join("")
      )
      .join("");
  }
};

window.PropsPanel = PropsPanel;
