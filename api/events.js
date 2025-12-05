// ============================================================
// /api/events.js — EmpirePicks
// Weekly NFL events feed (no eventId required)
// ============================================================

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const url = `${base}/sports/${sport}/events?apiKey=${apiKey}`;

  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return res
        .status(500)
        .json({ error: "Failed to fetch NFL events", status: r.status });
    }

    const events = await r.json();

    // --------------------------------------------------------
    // EMPIREPICKS — FILTER TO ONE "NFL WEEK"
    // Thursday 00:00 UTC through following Tuesday 11:00 UTC
    // --------------------------------------------------------
    const now = new Date();

    const todayUTC = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );

    const todayUTCDay = todayUTC.getUTCDay(); // 0 = Sun ... 4 = Thu
    const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;

    const thursdayUTC = new Date(todayUTC);
    thursdayUTC.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);
    thursdayUTC.setUTCHours(0, 0, 0, 0);

    const tuesdayUTC = new Date(thursdayUTC);
    tuesdayUTC.setUTCDate(thursdayUTC.getUTCDate() + 5); // Thu → Tue
    tuesdayUTC.setUTCHours(11, 0, 0, 0);

    const weekGames = (events || []).filter(ev => {
      const kickoff = new Date(ev.commence_time);
      return kickoff >= thursdayUTC && kickoff <= tuesdayUTC;
    });

    // Frontend expects the raw Odds API event shape:
    // {
    //   id, sport_key, sport_title, commence_time,
    //   home_team, away_team, ...
    // }
    res.status(200).json(weekGames);
  } catch (err) {
    console.error("EVENTS API ERROR:", err);
    res.status(500).json({ error: "Failed to fetch events", details: err.message });
  }
}
