// api/events.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "h2h,spreads,totals";

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  circa: 1.5,
  betcris: 1.4,
  betonlineag: 1.35,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85
};

function americanToProb(odds) {
  return odds > 0
    ? 100 / (odds + 100)
    : Math.abs(odds) / (Math.abs(odds) + 100);
}

function calcEV(prob, odds) {
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

module.exports = async (req, res) => {
  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`
    );

    const data = await r.json();
    const now = Date.now();

    const games = data
      .filter(
        g => now < new Date(g.commence_time).getTime() + 4 * 60 * 60 * 1000
      )
      .map(game => {
        const markets = {};

        for (const book of game.bookmakers || []) {
          for (const m of book.markets || []) {
            if (!markets[m.key]) markets[m.key] = {};
            for (const o of m.outcomes) {
              const side = o.name;
              if (!markets[m.key][side]) markets[m.key][side] = [];
              markets[m.key][side].push({
                odds: o.price,
                prob: americanToProb(o.price),
                book: book.key,
                point: o.point ?? null
              });
            }
          }
        }

        const normalizeMarket = key =>
          Object.entries(markets[key] || {}).map(([name, arr]) => {
            const prob = weightedConsensus(arr);
            const best = arr.sort(
              (a, b) => calcEV(prob, b.odds) - calcEV(prob, a.odds)
            )[0];

            return {
              name,
              point: best.point,
              odds: best.odds,
              consensus_prob: prob,
              ev: calcEV(prob, best.odds),
              book_count: arr.length
            };
          });

        return {
          id: game.id,
          commence_time: game.commence_time,
          home_team: game.home_team,
          away_team: game.away_team,
          markets: {
            h2h: { consensus: normalizeMarket("h2h") },
            spreads: { consensus: normalizeMarket("spreads") },
            totals: { consensus: normalizeMarket("totals") }
          }
        };
      });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json(games);
  } catch {
    res.status(200).json([]);
  }
};
