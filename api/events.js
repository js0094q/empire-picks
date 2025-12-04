@@ -8,84 +8,90 @@ const EV = (odds, tp = 0.5) => tp - implied(odds);
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

      const bestOutcome = (marketKey, outcomeName) => {
        let best = null;
        for (const bk of books) {
          const m = bk.markets?.find(m => m.key === marketKey);
          if (!m) continue;
          const o = m.outcomes?.find(o => o.name === outcomeName);
          if (o && (!best || o.price > best.price)) best = { ...o, book: bk.key };
        }
        return best;
      };

      const bestHome = bestOutcome("h2h", ev.home_team);
      const bestAway = bestOutcome("h2h", ev.away_team);
      const bestSpreadHome = bestOutcome("spreads", ev.home_team);
      const bestSpreadAway = bestOutcome("spreads", ev.away_team);
      const bestTotalOver = bestOutcome("totals", "Over");
      const bestTotalUnder = bestOutcome("totals", "Under");
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
        // The single-event endpoint returns an object, not an array
        // so grab the bookmakers list directly to ensure props always populate.
        propBooks = pj?.bookmakers || [];
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
@@ -107,37 +113,50 @@ export default async function handler(req, res) {
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
        mainlines: {
          moneyline: {
            home: bestHome ? { ...bestHome, prob: implied(bestHome.price) } : null,
            away: bestAway ? { ...bestAway, prob: implied(bestAway.price) } : null,
          },
          spread: {
            home: bestSpreadHome ? { ...bestSpreadHome, prob: implied(bestSpreadHome.price) } : null,
            away: bestSpreadAway ? { ...bestSpreadAway, prob: implied(bestSpreadAway.price) } : null,
          },
          total: {
            over: bestTotalOver ? { ...bestTotalOver, prob: implied(bestTotalOver.price) } : null,
            under: bestTotalUnder ? { ...bestTotalUnder, prob: implied(bestTotalUnder.price) } : null,
          },
        },
        props: propsFinal
      });
    }

    return res.status(200).json(results);

  } catch (err) {
    console.error("EVENTS API ERROR:", err);
    return res.status(500).json({ error: err.message });
  }
}
