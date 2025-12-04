// dashboard.js

document.addEventListener("DOMContentLoaded", loadDashboard);

async function loadDashboard() {
  const r = await fetch("/api/events");
  if (!r.ok) {
    console.error("Failed to fetch events");
    return;
  }

  const games = await r.json();
  const table = document.getElementById("dashboard");
  const body = table.querySelector("tbody");

  // sort best-first
  games.sort((a, b) => b.bestEV - a.bestEV);

  body.innerHTML = games.map(g => {
    const awayEV = g.ev.away !== null ? (g.ev.away * 100).toFixed(1) : "–";
    const homeEV = g.ev.home !== null ? (g.ev.home * 100).toFixed(1) : "–";
    const bestEV = (g.bestEV * 100).toFixed(1);

    return `
      <tr>
        <td>${g.away_team} @ ${g.home_team}</td>
        <td>${awayEV}%</td>
        <td>${homeEV}%</td>
        <td class="high-ev">${bestEV}%</td>
        <td>${new Date(g.commence_time)
          .toLocaleString("en-US", { timeZone: "America/New_York" })}</td>
      </tr>
    `;
  }).join("");
}
