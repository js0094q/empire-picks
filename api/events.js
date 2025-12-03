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
    // EMPIREPICKS — TWO-WEEK VISIBILITY WINDOW
    // --------------------------------------------------

    const now = new Date();

    // Normalize to UTC midnight
    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));

    const todayUTCDay = todayUTC.getUTCDay();
    const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;

    // === Start of THIS NFL WEEK (Thursday 00:00 UTC) ===
    const weekStart = new Date(todayUTC);
    weekStart.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);

    // === End of THIS WEEK (Tuesday 11:00 UTC) ===
    const weekEnd = new Date(weekStart);
    weekEnd.setUTCDate(weekStart.getUTCDate() + 5);
    weekEnd.setUTCHours(11, 0, 0, 0);

    // === Start of NEXT WEEK (same Tuesday 11:00 UTC) ===
    const nextWeekStart = new Date(weekEnd);

    // === End of NEXT WEEK (following Thursday night) ===
    const nextWeekEnd = new Date(nextWeekStart);
    nextWeekEnd.setUTCDate(nextWeekStart.getUTCDate() + 3);
    nextWeekEnd.setUTCHours(23, 59, 59, 999);

    // === FINAL FILTER: TWO-WEEK WINDOW ===
    const weekGames = events.filter(ev => {
      const kickoff = new Date(ev.commence_time);
      return kickoff >= weekStart && kickoff <= nextWeekEnd;
    });

    return res.status(200).json(weekGames);

  } catch (err) {
    console.error("API /events error:", err);
    return res.status(500).json({ error: err.message });
  }
}
