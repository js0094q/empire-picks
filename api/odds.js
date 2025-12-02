// /api/odds.js
// Fetches NFL odds for H2H, spreads, totals, using the same weekly window.

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const response = await fetch(url);
    if (!response.ok) {
      return res.status(500).json({ error: "Failed to fetch NFL odds" });
    }

    const games = await response.json();

    // -------------------------------
    // EMPIREPICKS WEEK WINDOW LOGIC
    // Tuesday 00:00 → Monday 23:59
    // -------------------------------

    const now = new Date();

    const weekStart = new Date(now);
    const dayOfWeek = now.getDay();
    const daysSinceTuesday = (dayOfWeek + 5) % 7;

    weekStart.setDate(now.getDate() - daysSinceTuesday);
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
