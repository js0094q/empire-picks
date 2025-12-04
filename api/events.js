// /api/events.js
import fetch from "node-fetch";

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    // 1. Fetch NFL events with mainlines
    const baseUrl = "https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events";
    const mainMarkets = "h2h,spreads,totals";

    const eventsRes = await fetch(`${baseUrl}/odds/?apiKey=${apiKey}&regions=us&markets=${mainMarkets}`);
    if (!eventsRes.ok) {
      return res.status(500).json({ error: "Failed fetching events" });
    }

    let events = await eventsRes.json();

    // Store enriched output
    const enriched = [];

    for (const ev of events) {
      const eventId = ev.id;

      // 2. Fetch props for the event
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
        "player_tds_over",
        "player_anytime_td",
        "player_longest_reception",
        "player_longest_rush",
        "player_fg_made",
        "player_fantasy_score"
      ].join(",");

      const propsUrl =
        `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds` +
        `?apiKey=${apiKey}&regions=us&markets=${propsMarkets}`;

      const propsRes = await fetch(propsUrl);
      let props = [];

      if (propsRes.ok) {
        const propsJson = await propsRes.json();
        props = propsJson.bookmakers || [];
      }

      // ------- EV HELPERS -------

      const implied = odds =>
        odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);

      const calcEV = (odds, trueProb) =>
        trueProb - implied(odds);

      // ------- MAINLINE BEST PICKS -------

      const getBest = (bookmakers, key, name) => {
        let best = null;
        for (const b of bookmakers) {
          const m = b.markets?.find(m => m.key === key);
          if (!m) continue;
          const o = m.outcomes?.find(o => o.name === name);
          if (!o) continue;
          if (!best || o.price > best.price) best = { ...o, book: b.key };
        }
        return best;
      };

      const bestMLAway = getBest(ev.bookmakers, "h2h", ev.away_team);
      const bestMLHome = getBest(ev.bookmakers, "h2h", ev.home_team);

      const evAway = bestMLAway ? calcEV(bestMLAway.price, 0.50) : 0;
      const evHome = bestMLHome ? calcEV(bestMLHome.price, 0.50) : 0;

      const bestEV = Math.max(evAway, evHome);

      // ------- PROP PARSING -------

      const parsedProps = [];

      for (const book of props) {
        for (const market of book.markets || []) {
          for (const outcome of market.outcomes || []) {
            const player = outcome.description || outcome.name || "";
            if (!player || player.includes(ev.home_team) || player.includes(ev.away_team)) continue;

            const key = market.key;
            const point = outcome.point ?? null;
            const price = outcome.price;

            parsedProps.push({
              player,
              type: key,
              point,
              price,
              side: outcome.name,
              book: book.key
            });
          }
        }
      }

      // Group props by player+type
      const grouped = {};

      for (const p of parsedProps) {
        const id = `${p.player}|${p.type}`;
        if (!grouped[id]) grouped[id] = [];
        grouped[id].push(p);
      }

      // EV for each prop group
      const propsEV = [];

      for (const groupId in grouped) {
        const group = grouped[groupId];

        const player = group[0].player;
        const type = group[0].type;

        // make Over list and Under list
        const overs = group.filter(g => g.side?.toLowerCase() === "over");
        const unders = group.filter(g => g.side?.toLowerCase() === "under");

        const bestOver = overs.sort((a, b) => b.price - a.price)[0] || null;
        const bestUnder = unders.sort((a, b) => b.price - a.price)[0] || null;

        if (!bestOver && !bestUnder) continue;

        const evOver = bestOver ? calcEV(bestOver.price, 0.50) : null;
        const evUnder = bestUnder ? calcEV(bestUnder.price, 0.50) : null;

        let bestSide = null;
        let bestEVVal = null;

        if (evOver !== null && evUnder !== null) {
          if (evOver >= evUnder) {
            bestSide = "Over";
            bestEVVal = evOver;
          } else {
            bestSide = "Under";
            bestEVVal = evUnder;
          }
        } else if (evOver !== null) {
          bestSide = "Over";
          bestEVVal = evOver;
        } else if (evUnder !== null) {
          bestSide = "Under";
          bestEVVal = evUnder;
        }

        propsEV.push({
          player,
          type,
          point: bestOver?.point ?? bestUnder?.point ?? null,
          over: bestOver,
          under: bestUnder,
          bestSide,
          bestEV: bestEVVal
        });
      }

      enriched.push({
        ...ev,
        ev: { awayML: evAway, homeML: evHome },
        bestEV,
        propsEV
      });
    }

    return res.status(200).json(enriched);

  } catch (err) {
    console.error("EVENTS API ERROR:", err);
    return res.status(500).json({ error: "Server error fetching events" });
  }
}
