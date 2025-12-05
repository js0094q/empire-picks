// /api/event-odds.js — props & markets for a single event

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const { eventId } = req.query;

    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }
    if (!eventId) {
      return res.status(400).json({ error: "Missing eventId" });
    }

    const base = "https://api.the-odds-api.com/v4";
    const sport = "americanfootball_nfl";
    const regions = "us";
    const oddsFormat = "american";

    const markets = [
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

    const url = `${base}/sports/${sport}/events/${encodeURIComponent(
      eventId
    )}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return res
        .status(500)
        .json({ error: "Failed fetching event odds", status: r.status });
    }

    const json = await r.json();
    res.status(200).json(json);
  } catch (err) {
    console.error("EVENT ODDS API ERROR", err);
    res.status(500).json({ error: "Event odds handler failed", details: err.message });
  }
}
