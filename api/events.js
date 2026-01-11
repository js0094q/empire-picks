// api/events.js

const API_KEY = process.env.ODDS_API_KEY;

const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "h2h,spreads,totals";

/**
 * Base weights: tuned so sharps matter more, but do not dominate.
 * If you want sharper differentiation, increase SHARP_GROUP_MULT slightly (e.g. 1.15 -> 1.25).
 */
const BOOK_BASE = {
  pinnacle: 1.35,
  circa: 1.25,
  betcris: 1.15,

  betonlineag: 1.05,

  fanduel: 1.0,
  draftkings: 1.0,

  betmgm: 0.95,
  caesars: 0.92,
  betrivers: 0.90
};

const SHARP_BOOKS = new Set(["pinnacle", "circa", "betcris"]);
const SHARP_GROUP_MULT = 1.15; // mild premium vs public
const PUBLIC_GROUP_MULT = 1.0;

function americanToProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * For a 2-outcome market (typical ML/spread/total):
 * Convert each side’s implied prob to no-vig by normalizing sum to 1.
 * Returns array of { ...outcome, prob_novig }.
 */
function noVigTwoWay(outcomes) {
  const probs = outcomes.map(o => americanToProb(o.price));
  const total = probs.reduce((a, b) => a + b, 0);
  if (!total) return outcomes.map(o => ({ ...o, prob_novig: null }));
  return outcomes.map((o, i) => ({ ...o, prob_novig: probs[i] / total }));
}

function calcEV(prob, odds) {
  if (prob == null || !Number.isFinite(prob) || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

function weightForBook(bookKey, groupMult) {
  const base = BOOK_BASE[bookKey] ?? 0.85;
  const sharpMult = SHARP_BOOKS.has(bookKey) ? SHARP_GROUP_MULT : PUBLIC_GROUP_MULT;
  // groupMult allows “public consensus” to downweight sharp premium (groupMult=1).
  return base * sharpMult * groupMult;
}

/**
 * Aggregates per-side consensus across books, using no-vig per-book probabilities.
 * Also computes a "public baseline" consensus where sharp premium is removed.
 */
function consensusForSides(sideBuckets) {
  const results = [];

  for (const [sideKey, entries] of Object.entries(sideBuckets)) {
    // Sharp-weighted consensus
    let wSum = 0;
    let pSum = 0;

    // Public baseline consensus (same base weights, no sharp premium)
    let wPub = 0;
    let pPub = 0;

    for (const e of entries) {
      const p = e.prob_novig;
      if (p == null || !Number.isFinite(p)) continue;

      const w = weightForBook(e.book, 1.0);
      wSum += w;
      pSum += p * w;

      const w0 = (BOOK_BASE[e.book] ?? 0.85) * 1.0; // public baseline
      wPub += w0;
      pPub += p * w0;
    }

    const consensus_prob = wSum ? pSum / wSum : null;
    const public_prob = wPub ? pPub / wPub : null;
    const lean = consensus_prob != null && public_prob != null ? consensus_prob - public_prob : null;

    // Best EV selection among books for THIS side
    let bestPick = null;
    for (const e of entries) {
      if (!Number.isFinite(e.price)) continue;
      const ev = calcEV(consensus_prob, e.price);
      if (ev == null) continue;

      if (!bestPick || ev > bestPick.ev) {
        bestPick = { odds: e.price, book: e.book, ev };
      }
    }

    results.push({
      side_key: sideKey,
      name: entries[0]?.name ?? null,
      point: entries[0]?.point ?? null,

      consensus_prob,
      public_prob,
      lean,

      best_odds: bestPick?.odds ?? null,
      best_book: bestPick?.book ?? null,
      ev: bestPick?.ev ?? null,

      book_count: entries.length
    });
  }

  return results;
}

/**
 * Market-level "sharp share" using weighted book composition:
 * share = (sum of weights from sharp books) / (sum of weights from all books)
 */
function sharpShare(entries) {
  let sharpW = 0;
  let totalW = 0;

  for (const e of entries) {
    const w = BOOK_BASE[e.book] ?? 0.85; // composition uses base, not premium
    totalW += w;
    if (SHARP_BOOKS.has(e.book)) sharpW += w;
  }

  return totalW ? sharpW / totalW : null;
}

module.exports = async (req, res) => {
  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`
    );

    const data = await r.json();
    const now = Date.now();

    const games = (Array.isArray(data) ? data : [])
      .filter(g => now < new Date(g.commence_time).getTime() + 4 * 60 * 60 * 1000)
      .map(game => {
        // Buckets per market, per side
        const markets = {
          h2h: {},
          spreads: {},
          totals: {}
        };

        // Track all entries per market for composition metrics
        const marketEntries = {
          h2h: [],
          spreads: [],
          totals: []
        };

        for (const book of game.bookmakers || []) {
          for (const m of book.markets || []) {
            if (!["h2h", "spreads", "totals"].includes(m.key)) continue;
            if (!Array.isArray(m.outcomes) || m.outcomes.length < 2) continue;

            // Convert this BOOK’s two-way outcomes to no-vig probabilities
            const novig = noVigTwoWay(m.outcomes);

            for (const o of novig) {
              const sideKey =
                m.key === "spreads"
                  ? `${o.name}|${o.point ?? ""}`
                  : m.key === "totals"
                  ? `${o.name}|${o.point ?? ""}`
                  : `${o.name}`;

              const entry = {
                book: book.key,
                name: o.name,
                point: o.point ?? null,
                price: o.price,
                prob_novig: o.prob_novig
              };

              if (!markets[m.key][sideKey]) markets[m.key][sideKey] = [];
              markets[m.key][sideKey].push(entry);
              marketEntries[m.key].push(entry);
            }
          }
        }

        // Normalize and compute sides
        const normalize = key => {
          const sides = consensusForSides(markets[key] || {});
          // Sort with most likely first (still keep both sides)
          sides.sort((a, b) => (b.consensus_prob ?? 0) - (a.consensus_prob ?? 0));
          return {
            sides,
            sharp_share: sharpShare(marketEntries[key])
          };
        };

        return {
          id: game.id,
          commence_time: game.commence_time,
          home_team: game.home_team,
          away_team: game.away_team,
          markets: {
            h2h: normalize("h2h"),
            spreads: normalize("spreads"),
            totals: normalize("totals")
          }
        };
      });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json(games);
  } catch {
    res.status(200).json([]);
  }
};
