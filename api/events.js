export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const url = `${base}/sports/${sport}/events?apiKey=${apiKey}`;

  try {
    const r = await fetch(url);
    const events = await r.json();

    // ===== NFL Week Window Logic =====
    // OddsAPI events are always in ISO 8601 UTC format.
    const now = new Date();

    // 1. Normalize to UTC midnight
    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));

    // 2. Determine most recent Thursday at 00:00 UTC.
    // JS weekday: Thu = 4
    const todayUTCDay = todayUTC.getUTCDay();
    const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;

    const thursdayUTC = new Date(todayUTC);
    thursdayUTC.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);

    // 3. End of window: Tuesday 11:00 UTC (covers MNF safely)
    const tuesdayUTC = new Date(thursdayUTC);
    tuesdayUTC.setUTCDate(tuesdayUTC.getUTCDate() + 5); // Thursday +5 = Tuesday
    tuesdayUTC.setUTCHours(11, 0, 0, 0);  // allow MNF + delays

    // 4. Filter events by kickoff within the NFL week window
    const weekGames = events.filter(ev => {
      const kickoff = new Date(ev.commence_time);
      return kickoff >= thursdayUTC && kickoff <= tuesdayUTC;
    });

    res.status(200).json(weekGames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
