// /api/odds.js — game odds (moneyline, spreads, totals)

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const base = "https://api.the-odds-api.com/v4";
    const sport = "americanfootball_nfl";
    const regions = "us";
    const markets = "h2h,spreads,totals";
    const oddsFormat = "american";

    const url = `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return res
        .status(500)
        .json({ error: "Failed fetching odds", status: r.status });
    }

    const json = await r.json();
    res.status(200).json(json);
  } catch (err) {
    console.error("ODDS API ERROR", err);
    res.status(500).json({ error: "Odds handler failed", details: err.message });
  }
}
