// api/props.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";

/* ===============================
   DISPLAY POLICY
   =============================== */
const PROP_MIN_PROB = 0.50;
const PROP_MIN_BOOKS = 1;
const MAX_ROWS_PER_MARKET = 25;

/* ===============================
   BOOK WEIGHTS
   =============================== */
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

const VALID_MARKETS = [
  // Touchdowns
  "player_anytime_td",
  "player_1st_td",
  "player_last_td",

  // Passing
  "player_pass_yds",
  "player_pass_tds",
  "player_pass_completions",
  "player_pass_attempts",

  // Rushing
  "player_rush_yds",
  "player_rush_attempts",

  // Receiving
  "player_receptions",
  "player_reception_yds"
];

/* ===============================
   HELPERS
   =============================== */
const baseW = b => BOOK_BASE[b] ?? 0.85;

const americanToProb = o =>
  o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);

const noVigPair = (a, b) => {
  const t = a + b;
  return t ? [a / t, b / t] : [null, null];
};

const calcEV = (p, o) => {
  if (!Number.isFinite(p) || !Number.isFinite(o)) return null;
  const win = o > 0 ? o / 100 : 100 / Math.abs(o);
  return p * win - (1 - p);
};

function determineSharpSet(books) {
  const named = books.filter(b => NAMED_SHARPS.has(b));
  if (named.length) return { set: new Set(named), source: "named" };

  const sorted = books
    .map(b => ({ b, w: baseW(b) }))
    .sort((a, b) => b.w - a.w);

  const k = Math.max(1, Math.round(sorted.length * 0.3));
  return { set: new Set(sorted.slice(0, k).map(x => x.b)), source: "proxy" };
}

function weightedAvg(entries, fn) {
  let w = 0, s = 0;
  for (const e of entries) {
    if (fn && !fn(e)) continue;
    if (!Number.isFinite(e.prob_novig)) continue;
    const bw = baseW(e.book);
    w += bw;
    s += bw * e.prob_novig;
  }
  return w ? s / w : null;
}

function sharpShare(entries, sharpSet) {
  let sw = 0, tw = 0;
  for (const e of entries) {
    const w = baseW(e.book);
    tw += w;
    if (sharpSet.has(e.book)) sw += w;
  }
  return tw ? sw / tw : null;
}

async function fetchEvent(eventId) {
  const url =
    `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds` +
    `?regions=${REGIONS}` +
    `&markets=${VALID_MARKETS.join(",")}` +
    `&oddsFormat=american` +
    `&apiKey=${API_KEY}`;

  const r = await fetch(url);
  return r.json();
}

/* ===============================
   HANDLER
   =============================== */
module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.json({ markets: {}, error: "Missing event id" });

  try {
    const data = await fetchEvent(id);

    if (!Array.isArray(data.bookmakers)) {
      return res.json({
        markets: {},
        error: data?.message || "No bookmakers available"
      });
    }

    const raw = {};

    for (const book of data.bookmakers) {
      for (const m of book.markets) {
        if (!raw[m.key]) raw[m.key] = {};
        for (const o of m.outcomes) {
          if (!o.description) continue;
          const key = `${o.description}||${o.point ?? ""}`;
          raw[m.key][key] ??= { player: o.description, point: o.point ?? null, perBook: {} };
          raw[m.key][key].perBook[book.key] ??= [];
          raw[m.key][key].perBook[book.key].push({ name: o.name, odds: o.price });
        }
      }
    }

    const markets = {};

    for (const mk of Object.keys(raw)) {
      const rows = [];

      for (const g of Object.values(raw[mk])) {
        const sides = {};

        for (const [book, outs] of Object.entries(g.perBook)) {
          if (outs.length === 2) {
            const [a, b] = outs.map(o => americanToProb(o.odds));
            const [na, nb] = noVigPair(a, b);
            [{ ...outs[0], prob_novig: na }, { ...outs[1], prob_novig: nb }]
              .forEach(e => (sides[e.name] ??= []).push({ ...e, book }));
          } else {
            outs.forEach(o =>
              (sides[o.name] ??= []).push({
                side: o.name,
                odds: o.odds,
                prob_novig: americanToProb(o.odds),
                book
              })
            );
          }
        }

        const entries = Object.values(sides).flat();
        const books = [...new Set(entries.map(e => e.book))];
        const { set: sharpSet, source } = determineSharpSet(books);

        for (const [side, es] of Object.entries(sides)) {
          if (es.length < PROP_MIN_BOOKS) continue;

          const prob = weightedAvg(es);
          if (!prob || prob < PROP_MIN_PROB) continue;

          const sharp = weightedAvg(es, e => sharpSet.has(e.book));
          const pub = weightedAvg(es, e => !sharpSet.has(e.book));
          const best = es
            .map(e => ({ ...e, ev: calcEV(prob, e.odds) }))
            .filter(e => e.ev != null)
            .sort((a, b) => b.ev - a.ev)[0];

          rows.push({
            player: g.player,
            point: g.point,
            side,
            prob,
            sharp_prob: sharp,
            public_prob: pub,
            book_lean: sharp != null && pub != null ? sharp - pub : null,
            market_lean: prob - 0.5,
            odds: best.odds,
            book: best.book,
            ev: best.ev,
            books: es.length,
            sharp_share: sharpShare(entries, sharpSet),
            sharp_source: source
          });
        }
      }

      markets[mk] = rows
        .sort((a, b) => (b.prob - a.prob) || (b.ev - a.ev))
        .slice(0, MAX_ROWS_PER_MARKET);
    }

    res.json({ markets });
  } catch {
    res.json({ markets: {}, error: "Server error" });
  }
};
