// ============================================================
// state.js — EmpirePicks v1.0 Central State Manager
// ============================================================

export const AppState = {
  events: [],    // list of events (cards)
  odds: {},      // odds keyed by eventId
  props: {},     // props keyed by eventId
  parlay: [],    // selected bet legs

  setEvents(list) {
    this.events = list;
  },

  setEventOdds(eventId, data) {
    this.odds[eventId] = data;
  },

  setEventProps(eventId, list) {
    this.props[eventId] = list;
  },

  addParlayLeg(leg) {
    // Avoid duplicates
    const exists = this.parlay.find(x =>
      x.eventId === leg.eventId &&
      x.label === leg.label &&
      x.value === leg.value
    );
    if (!exists) this.parlay.push(leg);
  },

  removeParlayLeg(id) {
    this.parlay = this.parlay.filter(x => x.id !== id);
  }
};

// Expose globally
window.AppState = AppState;
