// =============================================
// /api/odds.js — EmpirePicks Full Odds + Props
// =============================================

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const eventId = req.query.eventId;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }
    if (!eventId) {
      return res.status(400).json({ error: "Missing eventId parameter" });
    }

    const sport = "americanfootball_nfl";
    const regions = "us";
    const oddsFormat = "american";

    // ALL markets we want:
    const markets = [
      "h2h",
      "spreads",
      "totals",

      // PASSING
      "player_pass_attempts",
      "player_pass_completions",
      "player_pass_tds",
      "player_pass_yds",

      // RECEIVING
      "player_receptions",
      "player_reception_tds",
      "player_reception_yds",

      // RUSHING
      "player_rush_tds",
      "player_rush_yds",

      // TD markets
      "player_tds_over",
      "player_anytime_td"
    ].join(",");

    const base = "https://api.the-odds-api.com/v4";
    const url = `${base}/sports/${sport}/events/${eventId}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;

    const r = await fetch(url, { cache: "no-store" });

    if (!r.ok) {
      return res.status(500).json({
        error: "Failed fetching odds",
        status: r.status,
        details: await r.text()
      });
    }

    const json = await r.json();

    // API returns either:
    // - an array of games (usually 1)
    // - or an object error
    if (!Array.isArray(json)) {
      return res.status(200).json([]);
    }

    // return exactly one game's odds
    res.status(200).json(json);

  } catch (err) {
    console.error("ODDS API ERROR", err);
    res.status(500).json({
      error: "Odds handler failed",
      details: err.message
    });
  }
}
