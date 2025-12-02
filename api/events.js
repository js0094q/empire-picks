export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`
    );

    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching NFL events" });
    }

    const events = await r.json();

    // --------------------------------------------------
    // EMPIREPICKS WEEK WINDOW (Tuesday → Monday)
    // --------------------------------------------------

    const now = new Date();

    // Most recent Tuesday
    const weekStart = new Date(now);
    const today = now.getDay();      // Sun = 0, Mon = 1, Tue = 2...
    const offset = (today >= 2) ? today - 2 : today + 5;
    weekStart.setDate(now.getDate() - offset);
    weekStart.setHours(0, 0, 0, 0);

    // Following Monday
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    // Filter events correctly
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
