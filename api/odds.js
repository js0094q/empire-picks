// /api/odds.js — rolling 7-day raw odds feed

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

    const now = Date.now();
    const cutoff = now + 7 * 24 * 60 * 60 * 1000;

    const filtered = (data || []).filter(game => {
      const ko = new Date(game.commence_time).getTime();
      return ko >= now && ko <= cutoff;
    });

    res.status(200).json({ remaining, data: filtered });

  } catch (err) {
    console.error("ODDS FETCH ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
