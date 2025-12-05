// /api/events.js — list NFL events for current week

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const base = "https://api.the-odds-api.com/v4";
    const sport = "americanfootball_nfl";
    const url = `${base}/sports/${sport}/events?apiKey=${apiKey}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return res
        .status(500)
        .json({ error: "Failed fetching events", status: r.status });
    }

    const events = await r.json();

    // Thursday 00:00 UTC to Tuesday 11:00 UTC window
    const now = new Date();
    const todayUTC = new Date(
      Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate()
      )
    );
    const todayUTCDay = todayUTC.getUTCDay();
    const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;

    const thursdayUTC = new Date(todayUTC);
    thursdayUTC.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);
    thursdayUTC.setUTCHours(0, 0, 0, 0);

    const tuesdayUTC = new Date(thursdayUTC);
    tuesdayUTC.setUTCDate(thursdayUTC.getUTCDate() + 5);
    tuesdayUTC.setUTCHours(11, 0, 0, 0);

    const weekEvents = (events || []).filter(ev => {
      const t = new Date(ev.commence_time);
      return t >= thursdayUTC && t <= tuesdayUTC;
    });

    res.status(200).json(weekEvents);
  } catch (err) {
    console.error("EVENTS API ERROR", err);
    res.status(500).json({ error: "Events handler failed", details: err.message });
  }
}
