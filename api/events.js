import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const MARKETS = "h2h,spreads,totals";
const FOUR_HOURS = 4 * 60 * 60 * 1000;

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85
};

function americanToProb(odds) {
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

function calcEV(prob, odds) {
  if (!prob || odds == null) return null;
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

function weightedConsensus(outcomes) {
  let wSum = 0;
  let pSum = 0;

  for (const o of outcomes) {
    const w = BOOK_WEIGHTS[o.book] ?? 0.75;
    wSum += w;
    pSum += o.prob * w;
  }

  return wSum ? pSum / wSum : null;
}

function publicConsensus(outcomes) {
  if (!outcomes.length) return null;
  return outcomes.reduce((a, b) => a + b.prob, 0) / outcomes.length;
}

export default async function handler(req, res) {
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
      `?regions=us&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    const now = Date.now();

    const games = data
      .filter(g => now < new Date(g.commence_time).getTime() + FOUR_HOURS)
      .map(g => {
        const markets = {};

        for (const book of g.bookmakers ?? []) {
          for (const m of book.markets ?? []) {
            if (!markets[m.key]) markets[m.key] = {};
            if (!markets[m.key][book.key])
              markets[m.key][book.key] = [];

            for (const o of m.outcomes) {
              markets[m.key][book.key].push({
                name: o.name,
                point: o.point,
                odds: o.price,
                prob: americanToProb(o.price),
                book: book.key
              });
            }
          }
        }

        for (const mk of Object.keys(markets)) {
          const flat = Object.values(markets[mk]).flat();
          const sharpProb = weightedConsensus(flat);
          const publicProb = publicConsensus(flat);
          const delta =
            sharpProb != null && publicProb != null
              ? sharpProb - publicProb
              : null;

          flat.forEach(o => {
            o.consensus_prob = sharpProb;
            o.ev = calcEV(sharpProb, o.odds);
          });

          const lean = flat
            .filter(o => o.consensus_prob != null)
            .sort((a, b) => b.consensus_prob - a.consensus_prob)[0];

          markets[mk].lean = lean
            ? {
                label: lean.name,
                odds: lean.odds,
                confidence: lean.consensus_prob,
                delta
              }
            : null;
        }

        return {
          id: g.id,
          commence_time: g.commence_time,
          home_team: g.home_team,
          away_team: g.away_team,
          markets
        };
      });

    res.setHeader(
      "Cache-Control",
      "s-maxage=120, stale-while-revalidate=60"
    );

    res.status(200).json(games);
  } catch {
    res.status(500).json({ error: "Failed to load events" });
  }
}
