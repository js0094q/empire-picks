import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";

const MARKETS = [
  "player_pass_yds",
  "player_rush_yds",
  "player_receptions",
  "player_pass_tds",
  "player_pass_attempts",
  "player_pass_completions",
  "player_rush_tds"
].join(",");

export default async function handler(req, res) {
  const { id } = req.query;
  if (!id) return res.status(400).json({ error: "Missing event id" });

  try {
    const url =
      `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${id}/odds` +
      `?regions=us&markets=${MARKETS}&oddsFormat=american&apiKey=${API_KEY}`;

    const r = await fetch(url);
    const data = await r.json();

    const markets = {};

    for (const book of data.bookmakers ?? []) {
      for (const m of book.markets ?? []) {
        if (!markets[m.key]) markets[m.key] = {};

        for (const o of m.outcomes) {
          const player = o.description;
          if (!player) continue;

          if (!markets[m.key][player]) {
            markets[m.key][player] = {
              player,
              point: o.point,
              over: [],
              under: []
            };
          }

          const side = o.name.toLowerCase();
          const prob = americanToProb(o.price);

          markets[m.key][player][side].push({
            odds: o.price,
            prob,
            book: book.key
          });
        }
      }
    }

    for (const mk of Object.keys(markets)) {
      for (const p of Object.values(markets[mk])) {
        for (const side of ["over", "under"]) {
          const cons = weightedConsensus(p[side]);
          const best = p[side].sort(
            (a, b) => calcEV(cons, b.odds) - calcEV(cons, a.odds)
          )[0];

          p[side] = best
            ? {
                odds: best.odds,
                prob: cons,
                ev: calcEV(cons, best.odds)
              }
            : null;
        }
      }

      markets[mk] = Object.values(markets[mk]);
    }

    res.status(200).json({ markets });
  } catch {
    res.status(500).json({ error: "Props failed" });
  }
}
