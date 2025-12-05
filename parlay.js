let Parlay = {
  picks: [],

  add(pick) {
    if (this.picks.find(p => p.id === pick.id)) return;
    this.picks.push(pick);
    this.render();
  },

  remove(id) {
    this.picks = this.picks.filter(p => p.id !== id);
    this.render();
  },

  render() {
    const container = document.getElementById("parlay-items");
    if (!this.picks.length) {
      container.innerHTML = `<div class="muted">No picks added yet</div>`;
      return;
    }

    container.innerHTML = this.picks.map(p => `
      <div class="parlay-leg">
        <strong>${p.player}</strong> • ${marketLabel(p.market)} • ${fmtOdds(p.odds)}
        <button onclick="Parlay.remove('${p.id}')" class="button small">X</button>
      </div>
    `).join("");
  },

  async submit() {
    for (const pick of this.picks) {
      await fetch("/api/picks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: "anon", // hook into auth if needed
          team: pick.team,
          player: pick.player,
          type: marketLabel(pick.market),
          line: "-",
          odds: pick.odds,
          ev_score: pick.ev
        })
      });
    }

    alert("Parlay submitted!");
    this.picks = [];
    this.render();
  }
};

document.getElementById("place-parlay").addEventListener("click", () => Parlay.submit());
