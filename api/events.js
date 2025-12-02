// /api/events.js
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

    // --------------------------------------------------
    // EMPIREPICKS WEEK WINDOW (Tuesday 00:00 → Monday 23:59)
    // --------------------------------------------------

    const now = new Date();

    // Calculate this week's Tuesday
    const weekStart = new Date(now);
    const day = now.getDay(); // Sunday = 0, Monday = 1, Tuesday = 2 ...

    // Days since Tuesday (2)
    const daysFromTuesday = (day + 5) % 7; 
    weekStart.setDate(now.getDate() - daysFromTuesday);
    weekStart.setHours(0, 0, 0, 0);

    // Monday end
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6); // Tue -> Mon = +6 days
    weekEnd.setHours(23, 59, 59, 999);

    // Filter events in this range
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
