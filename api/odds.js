export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    // ------------------------------------------------------------
    // FIRST: Fetch events so we know which IDs to keep
    // ------------------------------------------------------------
    const controllerEvents = new AbortController();
    const timeoutEvents = setTimeout(() => controllerEvents.abort(), 10000);

    const eventsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`,
      { signal: controllerEvents.signal }
    );

    clearTimeout(timeoutEvents);

    if (!eventsRes.ok) {
      return res.status(500).json({ error: "Failed fetching NFL events" });
    }

    let allEvents;
    try {
      allEvents = await eventsRes.json();
    } catch (err) {
      console.error("Failed parsing /events JSON inside /odds:", err);
      return res.status(500).json({ error: "Invalid events JSON" });
    }

    // ------------------------------------------------------------
    // Build two-week window (same as /events)
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
    // Extract event IDs in window
    // ------------------------------------------------------------
    const eventIdsInWindow = new Set(
      allEvents
        .filter(ev => {
          const kickoff = new Date(ev.commence_time);
          if (isNaN(kickoff.getTime())) {
            console.warn("Invalid kickoff time in /odds event:", ev);
            return false;
          }
          return kickoff >= weekStart && kickoff <= nextWeekEnd;
        })
        .map(ev => ev.id)
    );

    // ------------------------------------------------------------
    // SECOND: Fetch odds
    // ------------------------------------------------------------
    const controllerOdds = new AbortController();
    const timeoutOdds = setTimeout(() => controllerOdds.abort(), 10000);

    const oddsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
      { signal: controllerOdds.signal }
    );

    clearTimeout(timeoutOdds);

    if (!oddsRes.ok) {
      return res.status(500).json({ error: "Failed fetching NFL odds" });
    }

    let allOdds;
    try {
      allOdds = await oddsRes.json();
    } catch (err) {
      console.error("Failed parsing /odds JSON:", err);
      return res.status(500).json({ error: "Invalid odds JSON" });
    }

    const remaining = oddsRes.headers.get("x-requests-remaining");

    // ------------------------------------------------------------
    // Filter odds: KEEP ALL ODDS FOR EVENTS STILL IN WINDOW
    // ------------------------------------------------------------
    const filteredOdds = allOdds.filter(od => eventIdsInWindow.has(od.id));

    return res.status(200).json({ remaining, data: filteredOdds });

  } catch (err) {
    console.error("API /odds fatal error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
