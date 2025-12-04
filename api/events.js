// /api/events.js
const SPORT = "americanfootball_nfl";
const BASE = "https://api.the-odds-api.com/v4";

const implied = odds => odds > 0 ? 100/(odds+100) : -odds/(-odds+100);
const EV = (odds, tp = 0.5) => tp - implied(odds);

export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  try {
    // 1) Fetch all events
    const eventsResp = await fetch(
      `${BASE}/sports/${SPORT}/events?apiKey=${API_KEY}&regions=us`
    );
    if (!eventsResp.ok) throw new Error("Failed fetching events");
    const events = await eventsResp.json();

    const results = [];

    for (const ev of events) {
      const id = ev.id;

      // ---- MAINLINES -----------------------------------
      const oddsResp = await fetch(
        `${BASE}/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=us&markets=h2h,spreads,totals&eventIds=${id}`
      );

      const oddsJson = oddsResp.ok ? await oddsResp.json() : [];
      const books = oddsJson[0]?.bookmakers || [];

      const best = (team) => {
        let b = null;
        for (const bk of books) {
          const m = bk.markets?.find(m => m.key === "h2h");
          if (!m) continue;
          const o = m.outcomes?.find(o => o.name === team);
          if (o && (!b || o.price > b.price)) b = { ...o, book: bk.key };
        }
        return b;
      };

      const bestHome = best(ev.home_team);
      const bestAway = best(ev.away_team);
      const evHome = bestHome ? EV(bestHome.price) : null;
      const evAway = bestAway ? EV(bestAway.price) : null;
      const bestEV = Math.max(evHome ?? 0, evAway ?? 0);

      // ---- PROPS ---------------------------------------
      const propMarkets = [
        "player_pass_yds","player_pass_tds","player_pass_attempts",
        "player_pass_completions",
        "player_rush_yds","player_rush_tds",
        "player_receptions","player_reception_yds","player_reception_tds",
        "player_anytime_td","player_tds_over"
      ].join(",");

      const propsResp = await fetch(
        `${BASE}/sports/${SPORT}/events/${id}/odds?apiKey=${API_KEY}&regions=us&markets=${propMarkets}`
      );

      let propBooks = [];
      if (propsResp.ok) {
        const pj = await propsResp.json();
        propBooks = pj[0]?.bookmakers || [];
      }

      // ---- PARSE PROPS ----------------------------------
      const parsed = [];

      for (const bk of propBooks) {
        for (const m of (bk.markets || [])) {
          for (const o of (m.outcomes || [])) {
            if (!o.description) continue;

            parsed.push({
              player: o.description,
              metric: m.key,
              side: o.name,
              point: o.point,
              price: o.price,
              book: bk.key
            });
          }
        }
      }

      // Group props
      const groups = {};
      for (const p of parsed) {
        const key = `${p.player}|${p.metric}`;
        if (!groups[key]) groups[key] = [];
        groups[key].push(p);
      }

      const propsFinal = [];
      for (const key in groups) {
        const grp = groups[key];
        const player = grp[0].player;
        const metric = grp[0].metric;

        const overs = grp.filter(x => x.side.toLowerCase() === "over");
        const unders = grp.filter(x => x.side.toLowerCase() === "under");

        const bestO = overs.sort((a,b)=>b.price-a.price)[0] || null;
        const bestU = unders.sort((a,b)=>b.price-a.price)[0] || null;

        const evO = bestO ? EV(bestO.price) : null;
        const evU = bestU ? EV(bestU.price) : null;

        let bestSide = null;
        let bestVal = null;
        if (evO !== null && evU !== null)
          bestSide = evO >= evU ? "Over" : "Under",
          bestVal  = Math.max(evO, evU);
        else if (evO !== null) bestSide = "Over", bestVal = evO;
        else if (evU !== null) bestSide = "Under", bestVal = evU;

        propsFinal.push({
          player, metric,
          over: bestO, under: bestU,
          bestSide, bestEV: bestVal
        });
      }

      // ---- PUSH EVENT -----------------------------------
      results.push({
        ...ev,
        ev: { home: evHome, away: evAway },
        bestEV,
        mainlines: books,
        props: propsFinal
      });
    }

    return res.status(200).json(results);

  } catch (err) {
    console.error("EVENTS API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
