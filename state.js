// state.js — central in-memory store

const AppState = {
  events: [],
  odds: {},   // by eventId
  props: {},  // by eventId
  parlay: [],

  setEvents(list) {
    this.events = list || [];
  },

  addParlayLeg(leg) {
    const exists = this.parlay.find(
      x => x.id === leg.id
    );
    if (!exists) this.parlay.push(leg);
  },

  removeParlayLeg(id) {
    this.parlay = this.parlay.filter(x => x.id !== id);
  }
};

window.AppState = AppState;
