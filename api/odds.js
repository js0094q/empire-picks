export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?` +
      `apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const r = await fetch(url);

    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching NFL odds" });
    }

    const games = await r.json();

    // --------------------------------------------------
    // SAME WINDOW AS EVENTS
    // --------------------------------------------------

    const now = new Date();
    const today = now.getDay();

    const weekStart = new Date(now);
    const offset = (today >= 2) ? today - 2 : today + 5;
    weekStart.setDate(now.getDate() - offset);
    weekStart.setHours(0, 0, 0, 0);

    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);

    const filtered = games.filter(g => {
      const d = new Date(g.commence_time);
      return d >= weekStart && d <= weekEnd;
    });

    return res.status(200).json(filtered);
  } catch (error) {
    console.error("ODDS API ERROR:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}
