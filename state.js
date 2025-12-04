export const AppState = {
  events: [],
  parlay: [],

  addParlayLeg(leg) {
    if (!this.parlay.find(x => x.id === leg.id)) {
      this.parlay.push(leg);
    }
  },

  removeParlayLeg(id) {
    this.parlay = this.parlay.filter(x => x.id !== id);
  }
};

window.AppState = AppState;
