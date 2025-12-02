import { parseISO } from "date-fns";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;

    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`
    );

    const events = await r.json();

    // --- Correct NFL weekly range ---
    const now = new Date();

    // Week starts on TUESDAY at 00:00
    const thisTuesday = new Date(now);
    thisTuesday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); // Moves to previous Tuesday
    thisTuesday.setHours(0, 0, 0, 0);

    // Week ends next Monday 23:59
    const nextMonday = new Date(thisTuesday);
    nextMonday.setDate(thisTuesday.getDate() + 6);
    nextMonday.setHours(23, 59, 59, 999);

    const filtered = events.filter(ev => {
      const d = parseISO(ev.commence_time);
      return d >= thisTuesday && d <= nextMonday;
    });

    return res.status(200).json(filtered);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "NFL events fetch failed" });
  }
}
