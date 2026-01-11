// api/props.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";

// Loosened to ensure public site shows props
const PROP_MIN_PROB = 0.50;
const PROP_MIN_BOOKS = 1;
const MAX_ROWS_PER_MARKET = 40;

const BOOK_BASE = {
  pinnacle: 1.25,
  circa: 1.20,
  betcris: 1.10,
  betonlineag: 1.05,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.97,
  caesars: 0.95,
  betrivers: 0.92
};

const SHARP_HINT = new Set(["pinnacle", "circa", "betcris"]);

const PRIMARY_MARKETS = [
  "player_pass_tds",
  "player_anytime_td",
  "player_rush_longest"
];

// Fallback markets, in case your plan does not support some props
const FALLBACK_MARKETS = [
  "player_pass_tds",
  "player_anytime_td"
];

function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function calcEV(prob, odds) {
  if (prob == null || !Number.isFinite(prob) || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

function baseW(bookKey) {
  return BOOK_BASE[bookKey] ?? 0.85;
}

function noVigPair(pA, pB) {
  const total = pA + pB;
  if (!total) return [null, null];
  return [pA / total, pB / total];
}

function weightedConsensus(entries) {
  let wSum = 0;
  let pSum = 0;

  for (const e of entries) {
    if (e.prob_novig == null || !Number.isFinite(e.prob_novig)) continue;
    let w = baseW(e.book);
    // modest tilt if sharp books exist, not required
    if (SHARP_HINT.has(e.book)) w *= 1.05;
    wSum += w;
    pSum += e.prob_novig * w;
  }

  return wSum ? pSum / wSum : null;
}

async function fetchEventOdds(eventId, markets) {
  const url =
    `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds` +
    `?regions=${REGIONS}&markets=${encodeURIComponent(markets.join(","))}` +
    `&oddsFormat=american&apiKey=${API_KEY}`;

  const r = await fetch(url);
  const json = await r.json();
  return json;
}

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(200).json({ markets: {}, error: "Missing id" });

  try {
    let data = await fetchEventOdds(id, PRIMARY_MARKETS);

    // If Odds API returns an error object, pass it through to the UI
    if (data && !Array.isArray(data) && (data.message || data.error_code || data.code)) {
      return res.status(200).json({
        markets: {},
        error: data.message || "Odds API error",
        meta: { code: data.code || data.error_code || null }
      });
    }

    // If no bookmakers, try fallback markets once
    const noBooks = !data || !data.bookmakers || data.bookmakers.length === 0;
    if (noBooks) {
      data = await fetchEventOdds(id, FALLBACK_MARKETS);

      if (data && !Array.isArray(data) && (data.message || data.error_code || data.code)) {
        return res.status(200).json({
          markets: {},
          error: data.message || "Odds API error",
          meta: { code: data.code || data.error_code || null }
        });
      }
    }

    const raw = {};
    for (const book of data.bookmakers || []) {
      for (const m of book.markets || []) {
        if (!raw[m.key]) raw[m.key] = {};
        for (const o of m.outcomes || []) {
          if (!o.description) continue;

          const player = o.description;
          const point = o.point ?? null;
          const groupKey = `${player}||${point}`;

          if (!raw[m.key][groupKey]) {
            raw[m.key][groupKey] = { player, point, perBook: {} };
          }
          if (!raw[m.key][groupKey].perBook[book.key]) raw[m.key][groupKey].perBook[book.key] = [];

          raw[m.key][groupKey].perBook[book.key].push({
            name: o.name,
            odds: o.price
          });
        }
      }
    }

    const markets = {};

    for (const mk of Object.keys(raw)) {
      const rows = [];

      for (const g of Object.values(raw[mk])) {
        const sideBuckets = {};

        for (const [bookKey, outs] of Object.entries(g.perBook)) {
          // If the book provides exactly two outcomes for same player+point, we can remove vig
          if (outs.length === 2 && Number.isFinite(outs[0].odds) && Number.isFinite(outs[1].odds)) {
            const p0 = americanToProb(outs[0].odds);
            const p1 = americanToProb(outs[1].odds);
            const [nv0, nv1] = noVigPair(p0, p1);

            const o0 = { ...outs[0], prob_novig: nv0, book: bookKey };
            const o1 = { ...outs[1], prob_novig: nv1, book: bookKey };

            if (!sideBuckets[o0.name]) sideBuckets[o0.name] = [];
            if (!sideBuckets[o1.name]) sideBuckets[o1.name] = [];
            sideBuckets[o0.name].push(o0);
            sideBuckets[o1.name].push(o1);
          } else {
            // Otherwise fallback to implied prob
            for (const o of outs) {
              if (!Number.isFinite(o.odds)) continue;
              const entry = { ...o, prob_novig: americanToProb(o.odds), book: bookKey };
              if (!sideBuckets[o.name]) sideBuckets[o.name] = [];
              sideBuckets[o.name].push(entry);
            }
          }
        }

        for (const [sideName, entries] of Object.entries(sideBuckets)) {
          const bookCount = entries.length;
          if (bookCount < PROP_MIN_BOOKS) continue;

          const prob = weightedConsensus(entries);
          if (prob == null || prob < PROP_MIN_PROB) continue;

          let best = null;
          for (const e of entries) {
            const ev = calcEV(prob, e.odds);
            if (ev == null) continue;
            if (!best || ev > best.ev) best = { odds: e.odds, book: e.book, ev };
          }
          if (!best) continue;

          rows.push({
            player: g.player,
            point: g.point,
            side: sideName,
            prob,
            odds: best.odds,
            book: best.book,
            ev: best.ev,
            books: bookCount
          });
        }
      }

      rows.sort(
        (a, b) =>
          (b.prob ?? 0) - (a.prob ?? 0) ||
          (b.ev ?? 0) - (a.ev ?? 0) ||
          (b.books ?? 0) - (a.books ?? 0)
      );

      markets[mk] = rows.slice(0, MAX_ROWS_PER_MARKET);
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json({
      markets,
      meta: {
        used_markets: Object.keys(markets),
        requested_markets: PRIMARY_MARKETS
      }
    });
  } catch (e) {
    res.status(200).json({ markets: {}, error: "Server error" });
  }
};
