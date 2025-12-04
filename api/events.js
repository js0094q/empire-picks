// EMPIREPICKS — Unified Events + Odds + Props + EV + Parlays

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";

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

  const implied = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
  const dec = o => (o > 0 ? 1 + o / 100 : 1 + 100 / -o);

  try {
    const [evR, oddsR] = await Promise.all([fetch(eventsURL), fetch(oddsURL)]);
    const events = await evR.json();
    const oddsData = await oddsR.json();

    const now = Date.now();
    const cutoff = now + 7 * 86400000;

    const oddsById = Object.fromEntries(oddsData.map(g => [g.id, g]));

    const valid = events.filter(e => {
      const t = new Date(e.commence_time).getTime();
      return t >= now && t <= cutoff;
    });

    // Fetch props
    const propReqs = valid.map(e => {
      const url =
        `${base}/sports/${sport}/events/${e.id}/odds?apiKey=${apiKey}&regions=us&markets=${propMarkets}&oddsFormat=american`;
      return fetch(url).then(r => r.json()).catch(() => ({}));
    });

    const propResults = await Promise.all(propReqs);

    const final = valid.map((ev, i) => {
      const books = (oddsById[ev.id]?.bookmakers || []);
      const dedup = dedupe(books);

      const best = bestLines(dedup, ev.away_team, ev.home_team);
      const evCalc = computeEV(best);
      const bestOverall = topEV(evCalc);

      const propsEV = computePropsEV(propResults[i]?.props?.bookmakers || []);

      const parlays = computeParlays(best);

      return {
        ...ev,
        bookmakers: dedup,
        bestLines: best,
        ev: evCalc,
        bestPick: bestOverall.pick,
        bestMarket: bestOverall.market,
        bestEV: bestOverall.ev,
        propsEV,
        bestParlays: parlays
      };
    });

    res.status(200).json(final);

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }

  // Dedupe same books
  function dedupe(bms) {
    const seen = new Set();
    const out = [];
    for (const b of bms) {
      const k = (b.key || b.title).toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(b);
    }
    return out;
  }

  // Best-line extraction
  function bestLines(bms, away, home) {
    const out = {
      moneyline: { away: null, home: null },
      spreads: { away: null, home: null },
      totals: { over: null, under: null }
    };

    for (const b of bms)
      for (const m of b.markets || [])
        for (const o of m.outcomes || []) {
          if (m.key === "h2h") {
            if (o.name === away && (!out.moneyline.away || o.price > out.moneyline.away.price))
              out.moneyline.away = { ...o, book: b.title };
            if (o.name === home && (!out.moneyline.home || o.price > out.moneyline.home.price))
              out.moneyline.home = { ...o, book: b.title };
          }

          if (m.key === "spreads") {
            if (o.name === away && (!out.spreads.away || o.price > out.spreads.away.price))
              out.spreads.away = { ...o, book: b.title };
            if (o.name === home && (!out.spreads.home || o.price > out.spreads.home.price))
              out.spreads.home = { ...o, book: b.title };
          }

          if (m.key === "totals") {
            if (o.name === "Over" && (!out.totals.over || o.price > out.totals.over.price))
              out.totals.over = { ...o, book: b.title };
            if (o.name === "Under" && (!out.totals.under || o.price > out.totals.under.price))
              out.totals.under = { ...o, book: b.title };
          }
        }

    return out;
  }

  // EV engine
  function computeEV(best) {
    const out = {};

    if (best.moneyline.away && best.moneyline.home) {
      const pA = implied(best.moneyline.away.price);
      const pH = implied(best.moneyline.home.price);
      const nvA = pA / (pA + pH);
      const nvH = pH / (pA + pH);
      out.awayML = nvA - pA;
      out.homeML = nvH - pH;
    }

    return out;
  }

  // Highest EV
  function topEV(ev) {
    let max = -999, pick = null;
    for (const [k, v] of Object.entries(ev)) {
      if (v > max) {
        max = v;
        pick = k;
      }
    }
    return { market: pick, pick, ev: max };
  }

  // Props EV
  function computePropsEV(books) {
    const out = [];
    const bucket = {};

    for (const b of books)
      for (const m of b.markets || [])
        for (const o of m.outcomes || []) {
          const key = `${o.description}:${o.point}`;
          if (!bucket[key]) bucket[key] = { over: [], under: [], meta: o };
          if (o.name === "Over") bucket[key].over.push({ ...o, book: b.title });
          if (o.name === "Under") bucket[key].under.push({ ...o, book: b.title });
        }

    for (const [k, g] of Object.entries(bucket)) {
      const meta = g.meta;
      const avg = arr => arr.length ? arr.reduce((s, x) => s + implied(x.price), 0) / arr.length : 0;

      const pO = avg(g.over);
      const pU = avg(g.under);
      const nvO = pO / (pO + pU);
      const nvU = pU / (pO + pU);

      const bestO = g.over.sort((a,b)=>b.price-a.price)[0];
      const bestU = g.under.sort((a,b)=>b.price-a.price)[0];

      const evO = nvO - implied(bestO?.price || 0);
      const evU = nvU - implied(bestU?.price || 0);

      out.push({
        player: meta.description,
        type: meta.key,
        point: meta.point,
        bestSide: evO > evU ? "Over" : "Under",
        bestEV: Math.max(evO, evU)
      });
    }

    return out.sort((a,b)=>b.bestEV - a.bestEV);
  }

  // Parlay EV
  function computeParlays(best) {
    const legs = [];
    const A = best.moneyline.away, H = best.moneyline.home;
    if (A) legs.push({ team:"Away ML", ...A });
    if (H) legs.push({ team:"Home ML", ...H });

    const P = [];
    for (let i=0; i<legs.length; i++)
      for (let j=i+1; j<legs.length; j++) {
        const L1 = legs[i], L2 = legs[j];
        const trueP = implied(L1.price)*implied(L2.price);
        const impliedP = 1 / (dec(L1.price)*dec(L2.price));
        P.push({
          legs:[L1,L2],
          trueProb:trueP,
          impliedProb:impliedP,
          edge:trueP - impliedP
        });
      }

    return P.sort((a,b)=>b.edge - a.edge).slice(0,3);
  }
}
