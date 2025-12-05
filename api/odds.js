// =============================================
// /api/odds.js — Odds + Props for ONE Game
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
    const markets = [
      "h2h",
      "spreads",
      "totals",
      "player_pass_attempts",
      "player_pass_completions",
      "player_pass_tds",
      "player_pass_yds",
      "player_receptions",
      "player_reception_tds",
      "player_reception_yds",
      "player_rush_tds",
      "player_rush_yds",
      "player_tds_over",
      "player_anytime_td"
    ].join(",");

    const url = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds
      ?apiKey=${apiKey}
      &regions=us
      &markets=${markets}
      &oddsFormat=american`
      .replace(/\s+/g, "");

    const r = await fetch(url, { cache: "no-store" });

    if (!r.ok) {
      return res.status(500).json({
        error: "Failed fetching odds",
        status: r.status,
        details: await r.text()
      });
    }

    const json = await r.json();

    if (!Array.isArray(json)) return res.status(200).json([]);

    res.status(200).json(json);

  } catch (err) {
    console.error("ODDS API ERROR", err);
    res.status(500).json({ error: "Odds handler failed", details: err.message });
  }
}
