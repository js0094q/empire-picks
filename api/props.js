// api/props.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";

const PROP_CONFIDENCE_MIN = 0.58;

const BOOK_WEIGHTS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85
};

const MARKETS = [
  "player_pass_tds",
  "player_pass_attempts",
  "player_pass_completions",
  "player_rush_tds"
].join(",");

function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
}

function calcEV(prob, odds) {
  const payout = odds > 0 ? odds / 100 : 100 / Math.abs(odds);
  return prob * payout - (1 - prob);
}

function weightedConsensus(outcomes) {
  let wSum = 0;
  let pSum = 0;
  for (const o of outcomes) {
    const w = BOOK_WEIGHTS[o.book] || 0.75;
    wSum += w;
    pSum += o.prob * w;
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
    const markets = {};

    for (const book of data.bookmakers || []) {
      for (const m of book.markets || []) {
        if (!markets[m.key]) markets[m.key] = {};
        for (const o of m.outcomes) {
          if (!o.description) continue;
          const player = o.description;
          const side = o.name.toLowerCase();
          if (!markets[m.key][player]) {
            markets[m.key][player] = { player, point: o.point, over: [], under: [] };
          }
          markets[m.key][player][side].push({
            odds: o.price,
            prob: americanToProb(o.price),
            book: book.key
          });
        }
      }
    }

    for (const mk of Object.keys(markets)) {
      markets[mk] = Object.values(markets[mk])
        .map(p => {
          for (const side of ["over", "under"]) {
            const cons = weightedConsensus(p[side]);
            if (!cons || cons < PROP_CONFIDENCE_MIN) p[side] = null;
            else {
              const best = p[side].sort(
                (a, b) => calcEV(cons, b.odds) - calcEV(cons, a.odds)
              )[0];
              p[side] = {
                odds: best.odds,
                prob: cons,
                ev: calcEV(cons, best.odds)
              };
            }
          }
          return p.over || p.under ? p : null;
        })
        .filter(Boolean);
    }

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json({ markets });
  } catch {
    res.status(200).json({ markets: {} });
  }
};
