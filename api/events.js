export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const url = `${base}/sports/${sport}/events?apiKey=${apiKey}`;

  try {
    const r = await fetch(url);
    const events = await r.json();

    // Filter only Thursday→Monday games
    const weekGames = events.filter(ev => {
      const d = new Date(ev.commence_time);
      return [4, 5, 6, 0, 1].includes(d.getUTCDay());
    });

    res.status(200).json(weekGames);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
