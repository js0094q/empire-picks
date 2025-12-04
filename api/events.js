// EMPIREPICKS — Unified Events + Odds + Props + EV + Parlay Engine

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";

  const propMarkets = [
    "player_pass_yds",
    "player_pass_tds",
    "player_rush_yds",
    "player_receptions",
    "player_anytime_td"
  ].join(",");

  const eventsURL = `${base}/sports/${sport}/events?apiKey=${apiKey}`;
  const oddsURL = `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american}`;

  const impliedProb = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  const americanToDecimal = o => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

  try {
    const [evR, oR] = await Promise.all([fetch(eventsURL), fetch(oddsURL)]);
    const events = await evR.json();
    const oddsData = await oR.json();

    const now = Date.now();
    const cutoff = now + 7 * 86400000;

    const oddsById = Object.fromEntries(oddsData.map(g => [g.id, g]));

    const validEvents = events.filter(ev => {
      const t = new Date(ev.commence_time).getTime();
      return t >= now && t <= cutoff;
    });

    // Fetch props for each event
    const propsRequests = validEvents.map(ev => {
      const url =
        `${base}/sports/${sport}/events/${ev.id}/odds?apiKey=${apiKey}&regions=us&markets=${propMarkets}&oddsFormat=american`;
      return fetch(url).then(r => r.json()).catch(() => ({ props: [] }));
    });

    const propsResults = await Promise.all(propsRequests);

    // Build the full dataset
    const final = validEvents.map((ev, i) => {
      const odds = oddsById[ev.id]?.bookmakers || [];
      const props = propsResults[i]?.props?.bookmakers || [];

      const deduped = dedupeBooks(odds);
      const bestLines = extractBestLines(deduped, ev.away_team, ev.home_team);
      const evCalc = computeEV(bestLines);

      const bestOverall = findBestEV(evCalc);

      const propsEV = computePropsEV(props);

      const parlay = buildBestParlays(bestLines);

      return {
        ...ev,
        bookmakers: deduped,
        props: props,
        bestLines,
        ev: evCalc,
        bestMarket: bestOverall.market,
        bestPick: bestOverall.pick,
        bestEV: bestOverall.ev,
        propsEV,
        bestParlays: parlay
      };
    });

    res.status(200).json(final);

  } catch (err) {
    console.error("EVENT API ERROR:", err);
    res.status(500).json({ error: err.message });
  }

  // ---------------- DEDUPE --------------------
  function dedupeBooks(bms) {
    const seen = new Set();
    const out = [];
    for (const b of bms) {
      const key = (b.key || b.title).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(b);
    }
    return out;
  }

  // ---------------- Best-Line Engine --------------------
  function extractBestLines(bms, away, home) {
    const best = {
      moneyline: { away: null, home: null },
      spreads: { away: null, home: null },
      totals: { over: null, under: null }
    };

    for (const bm of bms) {
      for (const m of bm.markets || []) {
        if (m.key === "h2h") {
          const A = m.outcomes.find(o => o.name === away);
          const H = m.outcomes.find(o => o.name === home);
          if (A && (!best.moneyline.away || A.price > best.moneyline.away.price))
            best.moneyline.away = { ...A, book: bm.title };
          if (H && (!best.moneyline.home || H.price > best.moneyline.home.price))
            best.moneyline.home = { ...H, book: bm.title };
        }

        if (m.key === "spreads") {
          for (const o of m.outcomes) {
            if (o.name === away &&
                (!best.spreads.away || o.price > best.spreads.away.price))
              best.spreads.away = { ...o, book: bm.title };

            if (o.name === home &&
                (!best.spreads.home || o.price > best.spreads.home.price))
              best.spreads.home = { ...o, book: bm.title };
          }
        }

        if (m.key === "totals") {
          for (const o of m.outcomes) {
            if (o.name === "Over" &&
                (!best.totals.over || o.price > best.totals.over.price))
              best.totals.over = { ...o, book: bm.title };

            if (o.name === "Under" &&
                (!best.totals.under || o.price > best.totals.under.price))
              best.totals.under = { ...o, book: bm.title };
          }
        }
      }
    }

    return best;
  }

  // ---------------- EV Engine --------------------
  function computeEV(best) {
    const out = {};

    // ML EV
    if (best.moneyline.away && best.moneyline.home) {
      const pA = impliedProb(best.moneyline.away.price);
      const pH = impliedProb(best.moneyline.home.price);

      const nvA = pA / (pA + pH);
      const nvH = pH / (pA + pH);

      out.awayML = nvA - pA;
      out.homeML = nvH - pH;
    }

    return out;
  }

  // ---------------- Best Market Selector --------------------
  function findBestEV(ev) {
    let maxEV = -999, best = { market: null, pick: null, ev: null };

    for (const [k, v] of Object.entries(ev)) {
      if (v > maxEV) {
        maxEV = v;
        best = { market: k, pick: k, ev: v };
      }
    }
    return best;
  }

  // ---------------- Player Props EV Engine --------------------
  function computePropsEV(bookmakers) {
    const results = [];

    const buckets = {}; // group by player + point
    for (const bm of bookmakers || []) {
      for (const m of bm.markets || []) {
        for (const o of m.outcomes || []) {
          const key = `${o.description || o.player}:${o.point}`;
          if (!buckets[key]) buckets[key] = { over: [], under: [], meta: o };
          const side = o.name.toLowerCase();
          if (side === "over") buckets[key].over.push({ ...o, book: bm.title });
          if (side === "under") buckets[key].under.push({ ...o, book: bm.title });
        }
      }
    }

    for (const [key, group] of Object.entries(buckets)) {
      const { over, under, meta } = group;

      const avg = arr =>
        arr.length ? arr.reduce((s, x) => s + impliedProb(x.price), 0) / arr.length : 0;

      const pO = avg(over);
      const pU = avg(under);

      const nvO = pO / (pO + pU);
      const nvU = pU / (pO + pU);

      const bestOver = over.sort((a, b) => b.price - a.price)[0];
      const bestUnder = under.sort((a, b) => b.price - a.price)[0];

      const evO = bestOver ? nvO - impliedProb(bestOver.price) : null;
      const evU = bestUnder ? nvU - impliedProb(bestUnder.price) : null;

      const winner = evO > evU ? "Over" : "Under";

      results.push({
        player: meta.description || meta.player,
        type: meta.key,
        point: meta.point,
        over: {
          ...bestOver,
          impliedProb: impliedProb(bestOver?.price || 0),
          trueProb: nvO,
          EV: evO
        },
        under: {
          ...bestUnder,
          impliedProb: impliedProb(bestUnder?.price || 0),
          trueProb: nvU,
          EV: evU
        },
        bestSide: winner,
        bestEV: Math.max(evO, evU)
      });
    }

    return results.sort((a, b) => b.bestEV - a.bestEV);
  }

  // ---------------- Parlay Engine --------------------
  function buildBestParlays(best) {
    const legs = [];

    // Only ML for now (cleanest)
    if (best.moneyline.away)
      legs.push({ team: "awayML", ...best.moneyline.away });

    if (best.moneyline.home)
      legs.push({ team: "homeML", ...best.moneyline.home });

    const parlays = [];

    for (let i = 0; i < legs.length; i++) {
      for (let j = i + 1; j < legs.length; j++) {
        const A = legs[i], B = legs[j];

        const pTrue = impliedProb(A.price) * impliedProb(B.price);
        const decP = americanToDecimal(A.price) * americanToDecimal(B.price);
        const pImplied = 1 / decP;

        parlays.push({
          legs: [A, B],
          trueProb: pTrue,
          impliedProb: pImplied,
          edge: pTrue - pImplied
        });
      }
    }

    return parlays.sort((a, b) => b.edge - a.edge).slice(0, 3);
  }
}
