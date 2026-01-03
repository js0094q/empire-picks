import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "h2h,spreads,totals";

const SHARP_BOOKS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
};

const PUBLIC_BOOKS = {
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
  betrivers: 0.85,
};

const IMPLIED = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));

const NO_VIG = probs => {
  const sum = probs.reduce((a, b) => a + b, 0);
  return probs.map(p => p / sum);
};

export default async function handler(req, res) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?apiKey=${API_KEY}&regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american`;

    const response = await fetch(url);
    const games = await response.json();

    const output = games.map(game => {
      const markets = { h2h: [], spreads: [], totals: [] };

      game.bookmakers.forEach(b => {
        const weight =
          SHARP_BOOKS[b.key] ?? PUBLIC_BOOKS[b.key] ?? null;
        if (!weight) return;

        b.markets.forEach(m => {
          m.outcomes.forEach(o => {
            markets[m.key].push({
              team: o.name,
              line: o.point ?? null,
              price: o.price,
              prob: IMPLIED(o.price),
              weight,
              book: b.key,
            });
          });
        });
      });

      function buildMarket(type) {
        if (!markets[type].length) return null;

        const grouped = {};
        markets[type].forEach(o => {
          const key = `${o.team}|${o.line}`;
          if (!grouped[key]) grouped[key] = [];
          grouped[key].push(o);
        });

        let best = null;

        Object.values(grouped).forEach(entries => {
          const sharp = entries.filter(e => SHARP_BOOKS[e.book]);
          const pub = entries.filter(e => PUBLIC_BOOKS[e.book]);

          if (sharp.length < 1 || pub.length < 2) return;

          const sharpProb =
            NO_VIG(sharp.map(e => e.prob)).reduce(
              (a, p, i) => a + p * sharp[i].weight,
              0
            ) /
            sharp.reduce((a, b) => a + b.weight, 0);

          const pubProb =
            NO_VIG(pub.map(e => e.prob)).reduce(
              (a, p, i) => a + p * pub[i].weight,
              0
            ) /
            pub.reduce((a, b) => a + b.weight, 0);

          const lean = sharpProb - pubProb;

          const stability =
            entries.filter(e => Math.abs(e.prob - sharpProb) < 0.015)
              .length / entries.length;

          const bestLine = entries.reduce((a, b) =>
            IMPLIED(b.price) < IMPLIED(a.price) ? b : a
          );

          const payout =
            bestLine.price > 0
              ? bestLine.price / 100
              : 100 / Math.abs(bestLine.price);

          const ev = sharpProb * payout - 1;

          if (!best || ev > best.ev) {
            best = {
              market: type,
              pick: bestLine.team,
              line: bestLine.line,
              bestPrice: bestLine.price,
              book: bestLine.book,
              sharpProb,
              publicProb: pubProb,
              sharpLean: lean,
              ev,
              stability,
              decision:
                ev >= 0.03 && Math.abs(lean) >= 0.02 ? "PLAY" : "PASS",
            };
          }
        });

        return best;
      }

      const candidates = [
        buildMarket("h2h"),
        buildMarket("spreads"),
        buildMarket("totals"),
      ].filter(Boolean);

      const bestMarket = candidates.sort((a, b) => b.ev - a.ev)[0];
      if (!bestMarket || bestMarket.decision !== "PLAY") return null;

      return {
        id: game.id,
        commence_time: game.commence_time,
        home: game.home_team,
        away: game.away_team,
        bestMarket,
      };
    });

    res.status(200).json(output.filter(Boolean));
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "events_failed" });
  }
}
