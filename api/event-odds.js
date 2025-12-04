export default async function handler(req, res) {
  try {
    const { eventId } = req.query;
    const apiKey = process.env.ODDS_API_KEY;

    if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    if (!eventId) return res.status(400).json({ error: "Missing eventId" });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds?` +
      `apiKey=${apiKey}&regions=us&markets=` +
      `player_pass_yds,player_pass_tds,player_rush_yds,player_receptions,player_anytime_td` +
      `&oddsFormat=american`;

    const r = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching event props" });
    }

    let props;
    try {
      props = await r.json();
    } catch (err) {
      console.error("Failed parsing event props JSON:", err);
      return res.status(500).json({ error: "Invalid props JSON from API" });
    }

    const remaining = r.headers.get("x-requests-remaining");

    return res.status(200).json({ remaining, props });

  } catch (err) {
    console.error("API /event-odds fatal error:", err);
    return res.status(500).json({ error: err.message || "Unknown error" });
  }
}
