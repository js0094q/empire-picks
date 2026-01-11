// api/props.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";

const PROP_CONFIDENCE_MIN = 0.58;
const MAX_PROPS_PER_MARKET = 12;

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
const SHARP_GROUP_MULT = 1.15;

const MARKETS = [
  "player_pass_tds",
  "player_pass_attempts",
  "player_pass_completions",
  "player_rush_tds"
].join(",");

function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function calcEV(prob, odds) {
  if (prob == null || !Number.isFinite(prob) || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

/**
 * For props, Odds API usually provides both Over/Under for the same player+point.
 * Remove vig at the BOOK level by normalizing the two sides if both exist at that book.
 * If only one side exists at a book, we fall back to implied prob (cannot remove vig).
 */
function noVigBookPair(overOdds, underOdds) {
  const pOver = americanToProb(overOdds);
  const pUnder = americanToProb(underOdds);
  const total = pOver + pUnder;
  if (!total) return { over: null, under: null };
  return { over: pOver / total, under: pUnder / total };
}

function weightConsensus(bookKey) {
  const base = BOOK_BASE[bookKey] ?? 0.85;
  const sharpMult = SHARP_BOOKS.has(bookKey) ? SHARP_GROUP_MULT : 1.0;
  return base * sharpMult;
}

function weightedConsensus(entries) {
  let wSum = 0;
  let pSum = 0;
  for (const e of entries) {
    if (e.prob_novig == null || !Number.isFinite(e.prob_novig)) continue;
    const w = weightConsensus(e.book);
    wSum += w;
    pSum += e.prob_novig * w;
  }
  return wSum ? pSum / wSum : null;
}

module.exports = async (req, res) => {
  const { id } = req.query;
  if (!id) return res.status(200).json({ markets: {} });

  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${id}/odds?regions=us&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`
    );

    const data = await r.json();
    const raw = {};

    // Collect raw odds per book, per market, per player+point
    for (const book of data.bookmakers || []) {
      for (const m of book.markets || []) {
        if (!raw[m.key]) raw[m.key] = {};
        for (const o of m.outcomes || []) {
          if (!o.description) continue;

          const player = o.description;
          const point = o.point ?? null;
          const key = `${player}||${point}`;

          if (!raw[m.key][key]) {
            raw[m.key][key] = {
              player,
              point,
              perBook: {} // bookKey -> { overOdds, underOdds }
            };
          }

          const side = (o.name || "").toLowerCase(); // "over" or "under"
          if (!raw[m.key][key].perBook[book.key]) raw[m.key][key].perBook[book.key] = {};
          raw[m.key][key].perBook[book.key][side] = o.price;
        }
      }
    }

    const markets = {};

    for (const mk of Object.keys(raw)) {
      const picks = [];

      for (const entry of Object.values(raw[mk])) {
        const overEntries = [];
        const underEntries = [];

        // For each book, compute no-vig if both sides exist
        for (const [bookKey, sides] of Object.entries(entry.perBook)) {
          const overOdds = sides.over;
          const underOdds = sides.under;

          if (Number.isFinite(overOdds) && Number.isFinite(underOdds)) {
            const nv = noVigBookPair(overOdds, underOdds);
            overEntries.push({ book: bookKey, odds: overOdds, prob_novig: nv.over });
            underEntries.push({ book: bookKey, odds: underOdds, prob_novig: nv.under });
          } else {
            // If only one side exists, fall back to implied prob (cannot fully remove vig)
            if (Number.isFinite(overOdds)) {
              overEntries.push({
                book: bookKey,
                odds: overOdds,
                prob_novig: americanToProb(overOdds)
              });
            }
            if (Number.isFinite(underOdds)) {
              underEntries.push({
                book: bookKey,
                odds: underOdds,
                prob_novig: americanToProb(underOdds)
              });
            }
          }
        }

        const consOver = weightedConsensus(overEntries);
        const consUnder = weightedConsensus(underEntries);

        // Apply confidence floor and require at least one side to qualify
        const overOk = consOver != null && consOver >= PROP_CONFIDENCE_MIN;
        const underOk = consUnder != null && consUnder >= PROP_CONFIDENCE_MIN;

        if (!overOk && !underOk) continue;

        // Choose the single best side by probability (tie-break by EV)
        const bestSideName =
          overOk && underOk
            ? consOver > consUnder
              ? "over"
              : consUnder > consOver
                ? "under"
                : null
            : overOk
              ? "over"
              : "under";

        const sidesToConsider = [];
        if (overOk) sidesToConsider.push({ side: "over", cons: consOver, entries: overEntries });
        if (underOk) sidesToConsider.push({ side: "under", cons: consUnder, entries: underEntries });

        let chosen = null;

        for (const s of sidesToConsider) {
          // best EV odds for this side
          let best = null;
          for (const e of s.entries) {
            const ev = calcEV(s.cons, e.odds);
            if (ev == null) continue;
            if (!best || ev > best.ev) best = { odds: e.odds, book: e.book, ev };
          }

          if (!best) continue;

          const candidate = {
            player: entry.player,
            point: entry.point,
            side: s.side.toUpperCase(),
            prob: s.cons,
            odds: best.odds,
            book: best.book,
            ev: best.ev
          };

          if (!chosen) {
            chosen = candidate;
            continue;
          }

          // Prefer higher probability, then higher EV
          if ((candidate.prob ?? 0) > (chosen.prob ?? 0)) chosen = candidate;
          else if ((candidate.prob ?? 0) === (chosen.prob ?? 0) && (candidate.ev ?? -999) > (chosen.ev ?? -999)) {
            chosen = candidate;
          }
        }

        if (!chosen) continue;

        // If both over and under qualify but probability differs, enforce bestSideName
        if (bestSideName && chosen.side.toLowerCase() !== bestSideName) {
          // Keep chosen as computed; it already uses probability then EV.
        }

        picks.push(chosen);
      }

      // Sort by probability, then EV, and keep only top N per market
      picks.sort((a, b) => (b.prob ?? 0) - (a.prob ?? 0) || (b.ev ?? 0) - (a.ev ?? 0));
      markets[mk] = picks.slice(0, MAX_PROPS_PER_MARKET);
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json({ markets });
  } catch {
    res.status(200).json({ markets: {} });
  }
};
