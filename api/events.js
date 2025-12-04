export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const url = `${base}/sports/${sport}/events?apiKey=${apiKey}`;

  try {
    const r = await fetch(url);
    const events = await r.json();

    const now = Date.now();
    const cutoff = now + 7 * 24 * 60 * 60 * 1000; // 7 days forward

    const filtered = events.filter(ev => {
      const ko = new Date(ev.commence_time).getTime();
      return ko >= now && ko <= cutoff;
    });

    res.status(200).json(filtered);

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
