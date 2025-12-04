// /api/events.js — Unified Events + Odds + Props + Best-Line + EV + Deduping

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";

  // Endpoints
  const eventsURL = `${base}/sports/${sport}/events?apiKey=${apiKey}`;
  const oddsURL =
    `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

  const propMarkets = [
    "player_pass_yds",
    "player_pass_tds",
    "player_rush_yds",
    "player_receptions",
    "player_anytime_td"
  ].join(",");

  // Helpers
  const impliedProb = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));

  // Convert American odds → decimal
  const americanToDecimal = o =>
    o > 0 ? 1 + o / 100 : 1 + 100 / -o;

  try {
    const [evR, oddsR] = await Promise.all([fetch(eventsURL), fetch(oddsURL)]);
    const events = await evR.json();
    const oddsData = await oddsR.json();

    const now = Date.now();
    const cutoff = now + 7 * 86400000;

    // Index odds by ID
    const oddsById = Object.fromEntries(
      oddsData.map(g => [g.id, g])
    );

    // Filter events
    const validEvents = events.filter(ev => {
      const ko = new Date(ev.commence_time).getTime();
      return ko >= now && ko <= cutoff;
    });

    // Fetch props for each valid game
    const propPromises = validEvents.map(ev => {
      const url =
        `${base}/sports/${sport}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${propMarkets}&oddsFormat=american`;
      return fetch(url)
        .then(r => r.json())
        .catch(() => ({ props: [] }));
    });

    const propsResults = await Promise.all(propPromises);

    // Build output
    const final = validEvents.map((ev, i) => {
      const gameOdds = oddsById[ev.id]?.bookmakers || [];

      // Normalize + dedupe bookmakers
      const deduped = dedupeBooks(gameOdds);

      // BEST LINES CALCULATED HERE
      const bestLines = extractBestLines(deduped, ev.away_team, ev.home_team);

      // EV CALCULATION
      const evCalc = computeEV(bestLines);

      return {
        ...ev,
        bookmakers: deduped,
        props: propsResults[i]?.props?.bookmakers ?? [],
        bestLines,
        ev: evCalc
      };
    });

    res.status(200).json(final);

  } catch (err) {
    console.error("EVENTS ERROR:", err);
    res.status(500).json({ error: err.message });
  }

  // ---------------------------------------------------------
  // DEDUPE LOGIC
  // ---------------------------------------------------------
  function dedupeBooks(bookmakers) {
    const seen = new Set();
    const out = [];

    for (const bm of bookmakers) {
      const key = bm.key || bm.title || "unknown";

      if (seen.has(key)) continue;
      seen.add(key);
      out.push(bm);
    }
    return out;
  }

  // ---------------------------------------------------------
  // BEST-LINE CALCULATOR
  // ---------------------------------------------------------
  function extractBestLines(bms, away, home) {
    let out = {
      moneyline: { away: null, home: null },
      spreads: { away: null, home: null },
      totals: { over: null, under: null }
    };

    for (const bm of bms) {
      for (const m of bm.markets || []) {
        if (m.key === "h2h") {
          const a = m.outcomes.find(o => o.name === away);
          const h = m.outcomes.find(o => o.name === home);
          if (a && (!out.moneyline.away || a.price > out.moneyline.away.price))
            out.moneyline.away = { ...a, book: bm.title };

          if (h && (!out.moneyline.home || h.price > out.moneyline.home.price))
            out.moneyline.home = { ...h, book: bm.title };
        }

        if (m.key === "spreads") {
          for (const o of m.outcomes) {
            if (o.name === away &&
              (!out.spreads.away || o.price > out.spreads.away.price))
              out.spreads.away = { ...o, book: bm.title };

            if (o.name === home &&
              (!out.spreads.home || o.price > out.spreads.home.price))
              out.spreads.home = { ...o, book: bm.title };
          }
        }

        if (m.key === "totals") {
          for (const o of m.outcomes) {
            if (o.name === "Over" &&
              (!out.totals.over || o.price > out.totals.over.price))
              out.totals.over = { ...o, book: bm.title };

            if (o.name === "Under" &&
              (!out.totals.under || o.price > out.totals.under.price))
              out.totals.under = { ...o, book: bm.title };
          }
        }
      }
    }

    return out;
  }

  // ---------------------------------------------------------
  // EV ENGINE
  // ---------------------------------------------------------
  function computeEV(best) {
    let evOut = {};

    const mlAway = best.moneyline.away;
    const mlHome = best.moneyline.home;

    if (mlAway && mlHome) {
      const pA = impliedProb(mlAway.price);
      const pH = impliedProb(mlHome.price);
      const total = pA + pH;

      const nvA = pA / total;
      const nvH = pH / total;

      evOut.awayML = nvA - pA;
      evOut.homeML = nvH - pH;
    }

    return evOut;
  }
}
