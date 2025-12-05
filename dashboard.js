// dashboard.js — analytics + parlay EV, uses window.Empire

(function () {
  const dashBody = document.getElementById("dash-body");
  const top5El = document.getElementById("top5");
  const refreshBtn = document.getElementById("refresh");
  const edgeInput = document.getElementById("parlayEdgeFilter");
  const genBtn = document.getElementById("generateParlays");
  const parlayResults = document.getElementById("parlayResults");

  if (!dashBody || !top5El) return; // not on dashboard page

  const { computeGameAnalytics, apiGET, money, prob } = window.Empire;

  const americanToDecimal = o => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

  function combinations(arr, k) {
    const res = [];
    function backtrack(start, combo) {
      if (combo.length === k) {
        res.push(combo.slice());
        return;
      }
      for (let i = start; i < arr.length; i++) {
        combo.push(arr[i]);
        backtrack(i + 1, combo);
        combo.pop();
      }
    }
    backtrack(0, []);
    return res;
  }

  let globalLegs = [];

  async function loadDashboard() {
    dashBody.innerHTML = `<tr><td colspan="6" class="muted">Loading…</td></tr>`;
    top5El.innerHTML = `<div class="muted">Loading…</div>`;
    parlayResults.innerHTML = "";

    try {
      const events = await apiGET("/api/events");
      const oddsWrap = await apiGET("/api/odds");
      const odds = oddsWrap.data ?? oddsWrap;
      const byId = Object.fromEntries(odds.map(g => [g.id, g]));

      const now = Date.now();
      const cutoff = 4 * 60 * 60 * 1000;

      const active = events.filter(ev => {
        const g = byId[ev.id];
        if (!g) return false;
        const t = new Date(ev.commence_time).getTime();
        return now <= t + cutoff;
      });

      globalLegs = [];
      const rows = [];

      active.forEach(ev => {
        const game = byId[ev.id];
        if (!game) return;

        const ana = computeGameAnalytics(game, ev.away_team, ev.home_team);
        const kickoffLocal = new Date(ev.commence_time).toLocaleString("en-US", {
         
