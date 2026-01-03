import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";

export default async function handler(req, res) {
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
      `?regions=us&markets=h2h,spreads,totals&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const text = await r.text();
    const data = JSON.parse(text);

    if (!Array.isArray(data)) {
      res.status(200).json([]);
      return;
    }

    const games = data.map(g => ({
      id: g.id,
      commence_time: g.commence_time,
      home_team: g.home_team,
      away_team: g.away_team,
      markets: Object.fromEntries(
        (g.bookmakers || []).flatMap(b =>
          (b.markets || []).map(m => [
            m.key,
            {
              ...(b.key ? { [b.key]: m.outcomes.map(o => ({
                name: o.name,
                odds: o.price,
                point: o.point,
                consensus_prob: null,
                ev: null
              })) } : {})
            }
          ])
        )
      )
    }));

    res.status(200).json(games);
  } catch {
    res.status(200).json([]);
  }
}
