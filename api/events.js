export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    // ------------------------------------------------------------
    // Timeout wrapper for fetch (10 seconds)
    // ------------------------------------------------------------
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`,
      { signal: controller.signal }
    );

    clearTimeout(timeout);

    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching NFL events" });
    }

    let events;
    try {
      events = await r.json();
    } catch (err) {
      console.error("Failed parsing /events JSON:", err);
      return res.status(500).json({ error: "Invalid JSON from Odds API" });
    }

    // ------------------------------------------------------------
    // EMPIREPICKS — TWO-WEEK VISIBILITY WINDOW
    // ------------------------------------------------------------
    const now = new Date();

    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));

    const todayUTCDay = todayUTC.getUTCDay();
    const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;

    const weekStart = new Date(todayUTC);
    weekStart.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);

    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 5);
    weekEnd.setUTCHours(11, 0, 0, 0);

    const nextWeekStart = new Date(weekEnd);

    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setUTCDate(nextWeekStart.getUTCDate() + 3);
    nextWeekEnd.setUTCHours(23, 59, 59, 999);

    // ------------------------------------------------------------
    // Filter events safely
    // ------------------------------------------------------------
    const finalEvents = events.filter(ev => {
      const kickoff = new Date(ev.commence_time);
      if (isNaN(kickoff.getTime())) {
        console.warn("Invalid kickoff time in event:", ev);
        return false;
      }
      return kickoff >= weekStart && kickoff <= nextWeekEnd;
    });

    return res.status(200).json(finalEvents);

  } catch (err) {
    console.error("API /events fatal error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
