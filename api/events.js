// /api/events.js  
export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) {
    res.status(500).json({ error: "Missing ODDS_API_KEY" });
    return;
  }

  const SPORT = "americanfootball_nfl";
  const BASE = "https://api.the-odds-api.com/v4";

  const implied = odds => odds > 0 ? 100/(odds + 100) : -odds/(-odds + 100);
  const evCalc  = odds => 0.5 - implied(odds);

  try {
    const eventsResp = await fetch(
      `${BASE}/sports/${SPORT}/events?apiKey=${API_KEY}&regions=us`
    );
    if (!eventsResp.ok) throw new Error("Failed to fetch events");
    const events = await eventsResp.json();

    const result = await Promise.all(events.map(async ev => {
      const id = ev.id;

      // --- Main odds ---
      const oddsUrl = `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}` +
        `&regions=us&markets=h2h,spreads,totals&eventIds=${id}`;
      const oddsResp = await fetch(oddsUrl);
      const oddsJson = oddsResp.ok ? await oddsResp.json() : [];
      const bookies = oddsJson[0]?.bookmakers || [];

      // best ML EV
      const findBest = team => {
        let best = null;
        for (const b of bookies) {
          const m = b.markets?.find(m => m.key === "h2h");
          const o = m?.outcomes?.find(o => o.name === team);
          if (o && (!best || o.price > best.price)) best = o;
        }
        return best;
      };

      const home = ev.home_team, away = ev.away_team;
      const bestHome = findBest(home), bestAway = findBest(away);
      const evHome = bestHome ? evCalc(bestHome.price) : null;
      const evAway = bestAway ? evCalc(bestAway.price) : null;
      const bestEV = Math.max(evHome ?? 0, evAway ?? 0);

      // --- Props ---
      const propsUrl = `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}&regions=us` +
        `&markets=player_pass_yds,player_rush_yds,player_receptions,player_anytime_td`;
      const propsResp = await fetch(propsUrl);
      let props = [];
      if (propsResp.ok) {
        const pj = await propsResp.json();
        if (Array.isArray(pj) && pj.length > 0) {
          props = pj[0].bookmakers || [];
        }
      }

      return {
        ...ev,
        bestEV,
        ev: { home: evHome, away: evAway },
        bookmakers: bookies,
        props
      };
    }));

    res.status(200).json(result);
  } catch (err) {
    console.error("Events API error:", err);
    res.status(500).json({ error: err.message });
  }
}
