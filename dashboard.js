document.addEventListener("DOMContentLoaded", loadDashboard);

async function loadDashboard() {
  const r = await fetch("/api/events");
  const games = await r.json();

  const container = document.getElementById("dashboard");

  container.innerHTML = `
    <table class="table">
      <thead>
        <tr>
          <th>Matchup</th>
          <th>EV Away</th>
          <th>EV Home</th>
          <th>Top EV</th>
          <th>Kickoff</th>
        </tr>
      </thead>
      <tbody></tbody>
    </table>
  `;

  const tbody = container.querySelector("tbody");
  games.sort((a, b) => b.bestEV - a.bestEV);

  for (const g of games) {
    const row = document.createElement("tr");

    row.innerHTML = `
      <td>${g.away_team} @ ${g.home_team}</td>
      <td>${(g.ev.awayML * 100).toFixed(1)}%</td>
      <td>${(g.ev.homeML * 100).toFixed(1)}%</td>
      <td style="color:var(--green); font-weight:700;">
        ${(g.bestEV * 100).toFixed(1)}%
      </td>
      <td>${new Date(g.commence_time).toLocaleString()}</td>
    `;

    tbody.appendChild(row);
  }
}
