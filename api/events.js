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
  if (typeof odds !== "number") return null;
  if (odds > 0) return 100 / (odds + 100);
  return -odds / (-odds + 100);
}

function safeJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${SPORT}/odds` +
      `?regions=us&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const text = await r.text();
    const data = safeJson(text);

    // 🔒 HARD GUARD
    if (!Array.isArray(data)) {
      console.error("Odds API bad response:", text);
      res.status(200).json([]); // EMPTY STATE, NOT 500
      return;
    }

    const now = Date.now();

    const games = data
      .filter(g => {
        const kickoff = new Date(g.commence_time).getTime();
        return now < kickoff + FOUR_HOURS;
      })
      .map(g => {
        const markets = {};

        for (const book of g.bookmakers ?? []) {
          for (const m of book.markets ?? []) {
            if (!markets[m.key]) markets[m.key] = {};
            if (!markets[m.key][book.key])
              markets[m.key][book.key] = [];

            for (const o of m.outcomes ?? []) {
              const prob = americanToProb(o.price);
              if (prob == null) continue;

              markets[m.key][book.key].push({
                name: o.name,
                point: o.point,
                odds: o.price,
                consensus_prob: prob,
                ev: null
              });
            }
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

    res.setHeader(
      "Cache-Control",
      "s-maxage=120, stale-while-revalidate=60"
    );

    res.status(200).json(games);
  } catch (err) {
    console.error("EVENTS API CRASH:", err);
    res.status(200).json([]); // NEVER 500
  }
}
