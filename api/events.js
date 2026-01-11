// api/events.js

const API_KEY = process.env.ODDS_API_KEY;

const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "h2h,spreads,totals";

/**
 * Base weights are conservative.
 * Sharp premium is applied via SHARP_GROUP_MULT, not by massive base differences.
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
const SHARP_GROUP_MULT = 1.15; // modest premium, appropriate for public site
const PUBLIC_GROUP_MULT = 1.0;

function americanToProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

/**
 * Convert a 2-outcome market to no-vig probabilities by normalizing implied probs to sum to 1.
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

function weightConsensus(bookKey) {
  const base = BOOK_BASE[bookKey] ?? 0.85;
  const sharpMult = SHARP_BOOKS.has(bookKey) ? SHARP_GROUP_MULT : PUBLIC_GROUP_MULT;
  return base * sharpMult;
}

function weightPublic(bookKey) {
  // Public baseline uses only base weights, no sharp premium
  return (BOOK_BASE[bookKey] ?? 0.85) * 1.0;
}

/**
 * Computes consensus per side using un-vigged probabilities, and also a public baseline.
 * Also picks best EV odds per side.
 */
function consensusForSides(sideBuckets) {
  const out = [];

  for (const [sideKey, entries] of Object.entries(sideBuckets)) {
    let wSum = 0;
    let pSum = 0;

    let wPub = 0;
    let pPub = 0;

    for (const e of entries) {
      const p = e.prob_novig;
      if (p == null || !Number.isFinite(p)) continue;

      const w = weightConsensus(e.book);
      wSum += w;
      pSum += p * w;

      const w0 = weightPublic(e.book);
      wPub += w0;
      pPub += p * w0;
    }

    const consensus_prob = wSum ? pSum / wSum : null;
    const public_prob = wPub ? pPub / wPub : null;
    const lean =
      consensus_prob != null && public_prob != null ? consensus_prob - public_prob : null;

    // best EV pick for THIS side
    let bestPick = null;
    for (const e of entries) {
      if (!Number.isFinite(e.price)) continue;
      const ev = calcEV(consensus_prob, e.price);
      if (ev == null) continue;
      if (!bestPick || ev > bestPick.ev) {
        bestPick = { odds: e.price, book: e.book, ev };
      }
    }

    out.push({
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

  // Most likely first, but keep both sides
  out.sort((a, b) => (b.consensus_prob ?? 0) - (a.consensus_prob ?? 0));
  return out;
}

/**
 * Weighted book composition, no sharp premium applied here.
 * This answers: how much of this market is coming from sharp books vs public books.
 */
function sharpShare(entries) {
  let sharpW = 0;
  let totalW = 0;

  for (const e of entries) {
    const w = BOOK_BASE[e.book] ?? 0.85;
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
        const buckets = { h2h: {}, spreads: {}, totals: {} };
        const entriesAll = { h2h: [], spreads: [], totals: [] };

        for (const book of game.bookmakers || []) {
          for (const m of book.markets || []) {
            if (!["h2h", "spreads", "totals"].includes(m.key)) continue;
            if (!Array.isArray(m.outcomes) || m.outcomes.length < 2) continue;

            const novig = noVigTwoWay(m.outcomes);

            for (const o of novig) {
              const sideKey =
                m.key === "h2h"
                  ? `${o.name}`
                  : `${o.name}|${o.point ?? ""}`;

              const entry = {
                book: book.key,
                name: o.name,
                point: o.point ?? null,
                price: o.price,
                prob_novig: o.prob_novig
              };

              if (!buckets[m.key][sideKey]) buckets[m.key][sideKey] = [];
              buckets[m.key][sideKey].push(entry);
              entriesAll[m.key].push(entry);
            }
          }
        }

        const normalize = key => {
          const sides = consensusForSides(buckets[key] || {});
          return {
            sides,
            sharp_share: sharpShare(entriesAll[key])
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
