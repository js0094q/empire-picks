// api/events.js

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "h2h,spreads,totals";

const {
  americanToProb,
  confidenceScore,
  decisionGate,
  directionArrow
} = require("./math");

module.exports = async (req, res) => {
  try {
    const r = await fetch(
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?regions=${REGIONS}&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`
    );

    const data = await r.json();
    const now = Date.now();

    const games = data
      .filter(g => now < new Date(g.commence_time).getTime() + 4 * 60 * 60 * 1000)
      .map(game => {
        const markets = {};

        for (const book of game.bookmakers || []) {
          for (const m of book.markets || []) {
            if (!markets[m.key]) markets[m.key] = [];
            for (const o of m.outcomes) {
              markets[m.key].push({
                name: o.name,
                point: o.point ?? null,
                odds: o.price,
                prob: americanToProb(o.price)
              });
            }
          }
        }

        const normalize = key =>
          (markets[key] || []).map(o => ({
            ...o,
            consensus_prob: o.prob,
            ev:
              o.prob *
                (o.odds > 0 ? o.odds / 100 : 100 / Math.abs(o.odds)) -
              (1 - o.prob)
          }));

        return {
          id: game.id,
          commence_time: game.commence_time,
          home_team: game.home_team,
          away_team: game.away_team,
          markets: {
            h2h: { consensus: normalize("h2h") },
            spreads: { consensus: normalize("spreads") },
            totals: { consensus: normalize("totals") }
          }
        };
      });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate=30");
    res.status(200).json(games);
  } catch (e) {
    res.status(200).json([]);
  }
};
