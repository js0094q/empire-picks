// /api/events.js
// Fetches NFL events for the EmpirePicks weekly window (Tuesday → Monday)

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const response = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`
    );

    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch NFL events" });
    }

    const events = await response.json();

    // -------------------------------
    // EMPIREPICKS WEEK WINDOW LOGIC
    // Tuesday 00:00 → Monday 23:59
    // -------------------------------

    const now = new Date();

    // Move back to Tuesday of the current EmpirePicks week
    const weekStart = new Date(now);
    const dayOfWeek = now.getDay(); // Sunday = 0, Monday = 1, Tuesday = 2, etc.
    const daysSinceTuesday = (dayOfWeek + 5) % 7; // How many days we need to go back to reach Tuesday
    weekStart.setDate(now.getDate() - daysSinceTuesday);
    weekStart.setHours(0, 0, 0, 0);

    // Week ends Monday 23:59:59
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const filtered = events.filter(ev => {
      const d = new Date(ev.commence_time);
      return d >= weekStart && d <= weekEnd;
    });

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("EVENT API ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
