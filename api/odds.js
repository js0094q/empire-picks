export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const regions = "us";
  const markets = "h2h,spreads,totals";
  const url = `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=american`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    const remaining = r.headers.get("x-requests-remaining");

    // Future: compute DIG (no-vig) average
    // For now, return raw + usage info
    res.status(200).json({ remaining, data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
