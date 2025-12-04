// ============================================================
// /api/events.js — EmpirePicks v1.0
// Dashboard event feed (spread + moneyline)
// ============================================================

import https from "https";

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const sport = "americanfootball_nfl";
  const regions = "us";
  const markets = "h2h,spreads";
  const oddsFormat = "american";

  if (!apiKey) {
    return res.status(500).json({ error: "Missing ODDS_API_KEY" });
  }

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let txt = "";
        resp.on("data", ch => txt += ch);
        resp.on("end", () => resolve(JSON.parse(txt)));
      }).on("error", reject);
    });

    if (data.message) {
      return res.status(400).json({ error: data.message });
    }

    const events = data.map(game => {
      const book =
        game.bookmakers.find(b => b.key === "draftkings") ||
        game.bookmakers.find(b => b.key === "fanduel") ||
        game.bookmakers[0];

      let home = "-", away = "-";

      if (book) {
        const spreads = book.markets.find(m => m.key === "spreads");
        if (spreads) {
          const h = spreads.outcomes.find(o => o.name === game.home_team);
          const a = spreads.outcomes.find(o => o.name === game.away_team);
          home = h?.point > 0 ? `+${h.point}` : h?.point || "-";
          away = a?.point > 0 ? `+${a.point}` : a?.point || "-";
        }
      }

      return {
        id: game.id,
        away: { name: game.away_team },
        home: { name: game.home_team },
        time: new Date(game.commence_time).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        odds: { home, away }
      };
    });

    res.status(200).json(events);

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch events",
      details: err.message
    });
  }
}
