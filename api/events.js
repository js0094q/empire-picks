@@ -8,84 +8,90 @@ const EV = (odds, tp = 0.5) => tp - implied(odds);
export default async function handler(req, res) {
  const API_KEY = process.env.ODDS_API_KEY;

  // If no API key is provided, return mock data so the UI still renders.
  if (!API_KEY) {
    return res.status(200).json(MOCK_EVENTS);
  }

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
    return res.status(200).json(MOCK_EVENTS);
  }
}

function buildMockEvents() {
  const now = new Date();
  const kickoff = new Date(now.getTime() + 3 * 60 * 60 * 1000).toISOString();
  const later = new Date(now.getTime() + 6 * 60 * 60 * 1000).toISOString();

  const makeMainlines = (homePrice, awayPrice, spreadPoint, spreadHome, spreadAway, totalPoint, overPrice, underPrice) => ({
    moneyline: {
      home: { name: "Home", price: homePrice, book: "mockbook", prob: implied(homePrice) },
      away: { name: "Away", price: awayPrice, book: "mockbook", prob: implied(awayPrice) },
    },
    spread: {
      home: { name: "Home", price: spreadHome, point: spreadPoint, book: "mockbook", prob: implied(spreadHome) },
      away: { name: "Away", price: spreadAway, point: -spreadPoint, book: "mockbook", prob: implied(spreadAway) },
    },
    total: {
      over: { name: "Over", price: overPrice, point: totalPoint, book: "mockbook", prob: implied(overPrice) },
      under: { name: "Under", price: underPrice, point: totalPoint, book: "mockbook", prob: implied(underPrice) },
    }
  });

  const makeProp = (player, metric, overPoint, overPrice, underPrice) => {
    const over = { name: "Over", price: overPrice, point: overPoint, book: "mockbook" };
    const under = { name: "Under", price: underPrice, point: overPoint, book: "mockbook" };
    const evO = EV(overPrice);
    const evU = EV(underPrice);
    const bestSide = evO >= evU ? "Over" : "Under";
    const bestEV = Math.max(evO, evU);

    return { player, metric, over, under, bestSide, bestEV };
  };

  return [
    {
      id: "mock-1",
      home_team: "Philadelphia Eagles",
      away_team: "Dallas Cowboys",
      commence_time: kickoff,
      bestEV: 0.07,
      mainlines: makeMainlines(-135, 120, -2.5, -110, -105, 47.5, -108, -112),
      props: [
        makeProp("Jalen Hurts", "player_pass_yds", 246.5, -110, -105),
        makeProp("A.J. Brown", "player_reception_yds", 78.5, -115, -102),
        makeProp("CeeDee Lamb", "player_receptions", 6.5, -102, -120),
        makeProp("Tony Pollard", "player_rush_yds", 61.5, 105, -125),
        makeProp("DeVonta Smith", "player_anytime_td", 0.5, 140, -170),
        makeProp("Jake Ferguson", "player_receiving_tds", 0.5, 185, -210),
      ]
    },
    {
      id: "mock-2",
      home_team: "Kansas City Chiefs",
      away_team: "Buffalo Bills",
      commence_time: later,
      bestEV: 0.11,
      mainlines: makeMainlines(-150, 130, -3.5, -105, -115, 49.5, -112, -108),
      props: [
        makeProp("Patrick Mahomes", "player_pass_tds", 2.5, 125, -145),
        makeProp("Travis Kelce", "player_reception_yds", 74.5, -102, -118),
        makeProp("Isiah Pacheco", "player_rush_yds", 68.5, -110, -110),
        makeProp("Josh Allen", "player_rush_yds", 39.5, -105, -115),
        makeProp("Stefon Diggs", "player_anytime_td", 0.5, 135, -160),
        makeProp("Rashee Rice", "player_receptions", 5.5, 110, -130),
      ]
    }
  ];
}
