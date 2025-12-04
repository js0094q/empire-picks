// api/data.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Missing API key" });
  }

  const url = new URL(req.url, `http://${req.headers.host}`);
  const type = url.searchParams.get("type") || "events_and_props";

  try {
    // ------------- FETCH EVENTS -------------
    const base = "https://api.the-odds-api.com/v4";
    const sport = "americanfootball_nfl";

    const eventsRes = await fetch(
      `${base}/sports/${sport}/events?apiKey=${apiKey}`
    );
    if (!eventsRes.ok) {
      throw new Error("Failed to fetch events");
    }
    const events = await eventsRes.json();

    // Prepare to fetch odds & props if requested
    const needOdds = type.includes("odds");
    const needProps = type.includes("props") || type === "events_and_props";

    const enriched = [];

    for (const ev of events) {
      const data = { ...ev }; // base event info

      // ------------- FETCH ODDS/MAIN LINES -------------
      if (needOdds || needProps) {
        const oddsRes = await fetch(
          `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&eventIds=${ev.id}`
        );
        if (!oddsRes.ok) {
          throw new Error(`Failed odds fetch for event ${ev.id}`);
        }
        const oddsJson = await oddsRes.json();
        const odds = oddsJson.length ? oddsJson[0].bookmakers : [];
        data.bookmakers = odds;
        // You can also compute best lines / EV here
      }

      // ------------- FETCH PROPS -------------
      if (needProps) {
        const propsMarkets = [
          "player_pass_attempts",
          "player_pass_completions",
          "player_pass_tds",
          "player_pass_yds",
          "player_receptions",
          "player_reception_tds",
          "player_reception_yds",
          "player_rush_tds",
          "player_rush_yds",
          "player_anytime_td",
          "player_longest_reception",
          "player_longest_rush",
          "player_fg_made",
          "player_fantasy_score"
        ].join(",");

        const propsRes = await fetch(
          `${base}/sports/${sport}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${propsMarkets}`
        );
        if (propsRes.ok) {
          const pjson = await propsRes.json();
          data.props = pjson.bookmakers || [];
        } else {
          data.props = [];
        }
      }

      enriched.push(data);
    }

    return res.status(200).json({ results: enriched });

  } catch (err) {
    console.error("API error:", err);
    return res.status(500).json({ error: err.message });
  }
}
