export default async function handler(req, res) {
  try {
    const { eventId } = req.query;

    if (!eventId) {
      return res.status(400).json({ error: "Missing eventId" });
    }

    const apiKey = process.env.ODDS_API_KEY;

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

    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds` +
      `?apiKey=${apiKey}` +
      `&regions=us` +
      `&markets=${markets}` +
      `&oddsFormat=american`;

    const r = await fetch(url);
    if (!r.ok) {
      return res.status(r.status).json({ error: "Odds API failed" });
    }

    const data = await r.json();

    return res.status(200).json({
      props: {
        bookmakers: data.bookmakers || []
      }
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Server error loading props" });
  }
}
