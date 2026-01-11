// api/props.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";

/**
 * Display policy (loosened so props show reliably)
 */
const PROP_MIN_PROB = 0.50;      // keep all reasonable props
const PROP_MIN_BOOKS = 1;        // allow single-book props
const MAX_ROWS_PER_MARKET = 30;  // per game per market

/**
 * Book weighting
 */
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

const NAMED_SHARPS = new Set(["pinnacle", "circa", "betcris"]);

/**
 * Markets to request
 * Keep these conservative and commonly available. Add more once stable.
 */
const PRIMARY_MARKETS = [
  "player_anytime_td",
  "player_pass_tds"
];

// Optional fallback if a given event has sparse props
const FALLBACK_MARKETS = [
  "player_anytime_td",
  "player_pass_tds"
];

function baseW(bookKey) {
  return BOOK_BASE[bookKey] ?? 0.85;
}

function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function noVigPair(pA, pB) {
  const total = pA + pB;
  if (!total) return [null, null];
  return [pA / total, pB / total];
}

function calcEV(prob, odds) {
  if (prob == null || !Number.isFinite(prob) || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

/**
 * Determine sharp set for a given prop group from books present:
 * - if named sharps present, use them
 * - else proxy: top ~30% by weight among present books
 */
function determineSharpSet(booksPresent) {
  const namedPresent = booksPresent.filter(b => NAMED_SHARPS.has(b));
  if (namedPresent.length > 0) return { sharpSet: new Set(namedPresent), source: "named" };

  const sorted = booksPresent
    .map(b => ({ b, w: baseW(b) }))
    .sort((a, b) => b.w - a.w);

  if (sorted.length <= 1) return { sharpSet: new Set(sorted.map(x => x.b)), source: "proxy" };

  const k = Math.max(1, Math.round(sorted.length * 0.30));
  return { sharpSet: new Set(sorted.slice(0, k).map(x => x.b)), source: "proxy" };
}

function weightedAvg(entries, predicateFn) {
  let wSum = 0;
  let pSum = 0;

  for (const e of entries) {
    if (predicateFn && !predicateFn(e)) continue;
    if (e.prob_novig == null || !Number.isFinite(e.prob_novig)) continue;

    const w = baseW(e.book);
    wSum += w;
    pSum += e.prob_novig * w;
  }

  return wSum ? pSum / wSum : null;
}

function sharpShare(entries, sharpSet) {
  let sharpW = 0;
  let totalW = 0;

  for (const e of entries) {
    const w = baseW(e.book);
    totalW += w;
    if (sharpSet.has(e.book)) sharpW += w;
  }

  return totalW ? sharpW / totalW : null;
}

async function fetchEventOdds(eventId, markets) {
  const url =
    `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds` +
    `?regions=${REGIONS}` +
    `&markets=${encodeURIComponent(markets.join(","))}` +
    `&oddsFormat=american` +
    `&apiKey=${API_KEY}`;

  const r = await fetch(url);
  const json = await r.json();
  return json;
}

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(200).json({ markets: {}, error: "Missing id" });

  try {
    let data = await fetchEventOdds(id, PRIMARY_MARKETS);

    // If API returns error object, surface it
    if (data && !Array.isArray(data) && (data.message || data.error_code || data.code)) {
      return res.status(200).json({
        markets: {},
        error: data.message || "Odds API error",
        meta: { code: data.code || data.error_code || null }
      });
    }

    // If no bookmakers, try fallback once
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

    /**
     * raw[marketKey][player||point] = { player, point, perBook: { bookKey: [{name, odds}] } }
     */
    const raw = {};

    for (const book of data.bookmakers || []) {
      for (const m of book.markets || []) {
        if (!raw[m.key]) raw[m.key] = {};

        for (const o of m.outcomes || []) {
          if (!o.description) continue;

          const player = o.description;
          const point = o.point ?? null;
          const groupKey = `${player}||${point}`;

          if (!raw[m.key][groupKey]) raw[m.key][groupKey] = { player, point, perBook: {} };
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

        // Build per-side entries with no-vig when a 2-way book is present
        for (const [bookKey, outs] of Object.entries(g.perBook)) {
          // If exactly two outcomes at this book, remove vig for that pair
          if (outs.length === 2 && Number.isFinite(outs[0].odds) && Number.isFinite(outs[1].odds)) {
            const p0 = americanToProb(outs[0].odds);
            const p1 = americanToProb(outs[1].odds);
            const [nv0, nv1] = noVigPair(p0, p1);

            const e0 = { side: outs[0].name, odds: outs[0].odds, prob_novig: nv0, book: bookKey };
            const e1 = { side: outs[1].name, odds: outs[1].odds, prob_novig: nv1, book: bookKey };

            if (!sideBuckets[e0.side]) sideBuckets[e0.side] = [];
            if (!sideBuckets[e1.side]) sideBuckets[e1.side] = [];
            sideBuckets[e0.side].push(e0);
            sideBuckets[e1.side].push(e1);
          } else {
            // Otherwise fallback to implied probability
            for (const o of outs) {
              if (!Number.isFinite(o.odds)) continue;
              const entry = {
                side: o.name,
                odds: o.odds,
                prob_novig: americanToProb(o.odds),
                book: bookKey
              };
              if (!sideBuckets[entry.side]) sideBuckets[entry.side] = [];
              sideBuckets[entry.side].push(entry);
            }
          }
        }

        // Determine sharp/public split based on books present in this group
        const allEntriesForGroup = Object.values(sideBuckets).flat();
        const booksPresent = Array.from(new Set(allEntriesForGroup.map(e => e.book)));
        const { sharpSet, source: sharp_source } = determineSharpSet(booksPresent);

        // Build a row per side
        for (const [sideName, entries] of Object.entries(sideBuckets)) {
          const bookCount = entries.length;
          if (bookCount < PROP_MIN_BOOKS) continue;

          const consensus_prob = weightedAvg(entries);
          if (consensus_prob == null || consensus_prob < PROP_MIN_PROB) continue;

          const sharp_prob = weightedAvg(entries, e => sharpSet.has(e.book));
          const public_prob = weightedAvg(entries, e => !sharpSet.has(e.book));
          const book_lean = sharp_prob != null && public_prob != null ? sharp_prob - public_prob : null;

          // Market lean is how far from 50/50 the market is leaning toward THIS side (un-vig)
          const market_lean = consensus_prob - 0.5;

          let best = null;
          for (const e of entries) {
            const ev = calcEV(consensus_prob, e.odds);
            if (ev == null) continue;
            if (!best || ev > best.ev) best = { odds: e.odds, book: e.book, ev };
          }
          if (!best) continue;

          rows.push({
            player: g.player,
            point: g.point,
            side: sideName,

            prob: consensus_prob,
            sharp_prob,
            public_prob,
            book_lean,
            market_lean,

            sharp_share: sharpShare(allEntriesForGroup, sharpSet),
            sharp_source,

            odds: best.odds,
            book: best.book,
            ev: best.ev,
            books: bookCount
          });
        }
      }

      // Rank: highest probability first, then EV, then number of books
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
        requested_markets: PRIMARY_MARKETS
      }
    });
  } catch {
    res.status(200).json({ markets: {}, error: "Server error" });
  }
};
