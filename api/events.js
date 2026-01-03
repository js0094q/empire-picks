import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const MARKETS = "h2h,spreads,totals";

export default async function handler(req, res) {
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
      `?regions=us&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    const games = data.map(g => {
      const markets = {};

      for (const book of g.bookmakers ?? []) {
        for (const m of book.markets ?? []) {
          if (!markets[m.key]) markets[m.key] = {};

          if (!markets[m.key][book.key])
            markets[m.key][book.key] = [];

          for (const o of m.outcomes) {
            const prob = americanToProb(o.price);

            markets[m.key][book.key].push({
              name: o.name,
              point: o.point,
              odds: o.price,
              prob,
              book: book.key
            });
          }
        }
      }

      for (const key of Object.keys(markets)) {
        for (const book of Object.keys(markets[key])) {
          const group = markets[key][book];
          const consensus = weightedConsensus(group);
          group.forEach(o => {
            o.consensus_prob = consensus;
            o.ev = calcEV(consensus, o.odds);
          });
        }
      }

      return {
        id: g.id,
        commence_time: g.commence_time,
        home_team: g.home_team,
        away_team: g.away_team,
        markets
      };
    });

    res.status(200).json(games);
  } catch {
    res.status(500).json({ error: "Events failed" });
  }
}
