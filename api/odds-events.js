// ================================================================
// /api/odds-events.js — Full Game + Props for All Events
// ================================================================

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const base = "https://api.the-odds-api.com/v4";
    const sport = "americanfootball_nfl";

    // 1. Fetch all events
    const evRes = await fetch(
      `${base}/sports/${sport}/events?apiKey=${apiKey}`,
      { cache: "no-store" }
    );

    const events = await evRes.json();
    const upcoming = events.filter(e => new Date(e.commence_time) > new Date());

    // 2. Markets list
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
      const url = `${base}/sports/${sport}/events/${ev.id}/odds
        ?apiKey=${apiKey}
        &regions=us
        &markets=${markets}
        &oddsFormat=american`
        .replace(/\s+/g, "");

      try {
        const oddsRes = await fetch(url, { cache: "no-store" });

        if (!oddsRes.ok) {
          results.push({ ...ev, odds: null, error: `Odds error ${oddsRes.status}` });
          continue;
        }

        const data = await oddsRes.json();
        const gameOdds = Array.isArray(data) ? data[0] : null;

        results.push({ ...ev, odds: gameOdds });

      } catch (err) {
        results.push({ ...ev, odds: null, error: err.message });
      }
    }

    return res.status(200).json(results);

  } catch (err) {
    console.error("ODDS-EVENTS ERROR", err);
    res.status(500).json({ error: "Odds-events handler failed", details: err.message });
  }
}
