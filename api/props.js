// ============================================================
// /api/props.js — EmpirePicks v1.0
// Returns player props for a specific event
// ============================================================

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const eventId = req.query.eventId;

  if (!apiKey || !eventId) {
    return res.status(400).json({ error: "Missing API key or eventId" });
  }

  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=player_props&oddsFormat=american`;

  try {
    const resp = await fetch(url);
    const data = await resp.json();

    if (!resp.ok) {
      return res.status(500).json({
        error: "Props API failure",
        details: data
      });
    }
    res.status(200).json(data);

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch props",
      details: err.message
    });
  }
}
