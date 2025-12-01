const auth = req.headers["authorization"];
if (!auth) return res.status(401).json({ error: "Missing auth" });
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

    // ===== NFL Week Window Logic (match events.js) =====
    const now = new Date();

    // Normalize to UTC midnight
    const todayUTC = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate()
    ));

    // Thursday 00:00 UTC (most recent)
    const todayUTCDay = todayUTC.getUTCDay();  // Thu = 4
    const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;
    const thursdayUTC = new Date(todayUTC);
    thursdayUTC.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);

    // Tuesday 11:00 UTC (capture MNF spillover)
    const tuesdayUTC = new Date(thursdayUTC);
    tuesdayUTC.setUTCDate(tuesdayUTC.getUTCDate() + 5);
    tuesdayUTC.setUTCHours(11, 0, 0, 0);

    // ===== Filter games inside the NFL weekly window =====
    const filtered = (data || []).filter(game => {
      const kickoff = new Date(game.commence_time);
      return kickoff >= thursdayUTC && kickoff <= tuesdayUTC;
    });

    res.status(200).json({
      remaining,
      data: filtered
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
