const auth = req.headers["authorization"];
if (!auth) return res.status(401).json({ error: "Missing auth" });
export default async function handler(req, res) {
  const { eventId } = req.query;
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  if (!eventId) return res.status(400).json({ error: "Missing eventId" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const regions = "us";
  const markets = [
    "player_pass_yds",
    "player_pass_tds",
    "player_rush_yds",
    "player_receptions",
    "player_anytime_td"
  ].join(",");

  const url = `${base}/sports/${sport}/events/${eventId}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=american`;

  try {
    const r = await fetch(url);
    const props = await r.json();
    const remaining = r.headers.get("x-requests-remaining");
    res.status(200).json({ remaining, props });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
