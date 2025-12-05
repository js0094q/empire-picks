// ================================================================
// /api/odds-events.js — EmpirePicks
// FULL AGGREGATED EVENTS + ODDS + PROPS (FanDuel-style structure)
// ================================================================

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const base = "https://api.the-odds-api.com/v4";
    const sport = "americanfootball_nfl";

    // ---------------------------
    // 1. Fetch ALL Events
    // ---------------------------
    const evRes = await fetch(
      `${base}/sports/${sport}/events?apiKey=${apiKey}`,
      { cache: "no-store" }
    );

    if (!evRes.ok) {
      return res.status(500).json({
        error: "Failed fetching events",
        status: evRes.status
      });
    }

    const events = await evRes.json();
    const upcoming = events.filter(ev => new Date(ev.commence_time) > new Date());

    // ---------------------------
    // 2. Fetch odds for all events
    // ---------------------------
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

    const results = [];

    for (const ev of upcoming) {
      const url = `${base}/sports/${sport}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${markets}&oddsFormat=american`;

      try {
        const oddsRes = await fetch(url, { cache: "no-store" });

        if (!oddsRes.ok) {
          results.push({
            ...ev,
            odds: null,
            error: `Odds error: ${oddsRes.status}`
          });
          continue;
        }

        const oddsJson = await oddsRes.json();

        // odds API returns array of 1 element
        const gameOdds = Array.isArray(oddsJson) ? oddsJson[0] : null;

        results.push({
          ...ev,
          odds: gameOdds
        });

      } catch (innerErr) {
        console.error("ODDS FETCH ERROR:", ev.id, innerErr);
        results.push({
          ...ev,
          odds: null,
          error: innerErr.message
        });
      }
    }

    // ---------------------------
    // 3. Return final merged dataset
    // ---------------------------
    return res.status(200).json(results);

  } catch (err) {
    console.error("ODDS-EVENTS API ERROR", err);
    res.status(500).json({
      error: "Odds-events handler failed",
      details: err.message
    });
  }
}
