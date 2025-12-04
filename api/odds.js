export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    // ----------------------------------------------
    // Fetch games for window reference
    // ----------------------------------------------
    const eventsRes = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`
    );

    const allEvents = await eventsRes.json();

    // ----------------------------------------------
    // Build same two-week window as /api/events
    // ----------------------------------------------
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

    // ----------------------------------------------
    // Filter events → only keep IDs in window
    // ----------------------------------------------
    const eventIdsInWindow = new Set(
      allEvents
        .filter(ev => {
          const kickoff = new Date(ev.commence_time);
          return kickoff >= weekStart && kickoff <= nextWeekEnd;
        })
        .map(ev => ev.id)
    );

    // ----------------------------------------------
    // Fetch odds
    // ----------------------------------------------
    const base = "https://api.the-odds-api.com/v4";
    const oddsURL = `${base}/sports/americanfootball_nfl/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const r = await fetch(oddsURL);
    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching NFL odds" });
    }

    const allOdds = await r.json();
    const remaining = r.headers.get("x-requests-remaining");

    // ----------------------------------------------
    // CORRECT FILTER: KEEP ODDS *BY EVENT ID*
    // ----------------------------------------------
    const filteredOdds = allOdds.filter(od => eventIdsInWindow.has(od.id));

    return res.status(200).json({ remaining, data: filteredOdds });

  } catch (err) {
    console.error("API /odds error:", err);
    return res.status(500).json({ error: err.message });
  }
}
