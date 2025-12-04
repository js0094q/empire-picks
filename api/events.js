import fetch from "node-fetch";

const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

// Helpers
const implied = o => o > 0 ? 100 / (o + 100) : -o / (-o + 100);
const EV = (odds, tp) => tp - implied(odds);

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  try {
    // Fetch events
    const eventsResp = await fetch(`${BASE}/sports/${SPORT}/events?apiKey=${apiKey}&regions=us`);
    if (!eventsResp.ok) throw new Error("Failed to fetch events");
    const events = await eventsResp.json();

    const out = [];

    for (const ev of events) {
      const eventId = ev.id;

      // Main odds
      const oddsResp = await fetch(
        `${BASE}/sports/${SPORT}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&eventIds=${eventId}`
      );
      const oddsJson = oddsResp.ok ? await oddsResp.json() : [];
      const bookmakers = oddsJson[0]?.bookmakers || [];

      // Best ML EV
      const findBest = (team) => {
        let best = null;
        for (const b of bookmakers) {
          const h2h = b.markets?.find(m => m.key === "h2h");
          if (!h2h) continue;
          const outcome = h2h.outcomes?.find(o => o.name === team);
          if (!outcome) continue;
          if (!best || outcome.price > best.price) best = { ...outcome, book: b.key };
        }
        return best;
      };

      const bestHome = findBest(ev.home_team);
      const bestAway = findBest(ev.away_team);

      const evHome = bestHome ? EV(bestHome.price, 0.5) : null;
      const evAway = bestAway ? EV(bestAway.price, 0.5) : null;
      const bestEV = Math.max(evHome ?? 0, evAway ?? 0);

      // Props
      const propsResp = await fetch(
        `${BASE}/sports/${SPORT}/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=player_pass_yds,player_rush_yds,player_receptions,player_anytime_td`
      );

      let props = [];
      if (propsResp.ok) {
        const propsJson = await propsResp.json();
        props = propsJson.bookmakers || [];
      }

      out.push({
        ...ev,
        bestEV,
        ev: { home: evHome, away: evAway },
        bookmakers,
        props
      });
    }

    return res.status(200).json(out);

  } catch (err) {
    console.error("EVENTS API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
