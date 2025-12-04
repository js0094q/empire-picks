// ============================================================
// /api/odds.js — EmpirePicks v1.0
// Provides ML, Spread, Totals for a specific game
// ============================================================

import https from "https";

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const sport = "americanfootball_nfl";
  const regions = "us";
  const oddsFormat = "american";
  const eventId = req.query.eventId;

  if (!apiKey || !eventId) {
    return res.status(400).json({ error: "Missing apiKey or eventId" });
  }

  const url = `https://api.the-odds-api.com/v4/sports/${sport}/events/${eventId}/odds?apiKey=${apiKey}&regions=${regions}&markets=h2h,totals&oddsFormat=${oddsFormat}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let txt = "";
        resp.on("data", ch => txt += ch);
        resp.on("end", () => resolve(JSON.parse(txt)));
      }).on("error", reject);
    });

    const book =
      data.bookmakers?.find(b => b.key === "draftkings") ||
      data.bookmakers?.find(b => b.key === "fanduel") ||
      data.bookmakers?.[0];

    const h2h = book?.markets.find(m => m.key === "h2h");
    const totals = book?.markets.find(m => m.key === "totals");

    const game = {
      id: data.id,
      home_team: data.home_team,
      away_team: data.away_team,
      odds: {
        h2h: {
          home: h2h?.outcomes.find(o => o.name === data.home_team)?.price || "-",
          away: h2h?.outcomes.find(o => o.name === data.away_team)?.price || "-"
        },
        totals: {
          points: totals?.outcomes.find(o => o.name === "Over")?.point || "-",
          over: totals?.outcomes.find(o => o.name === "Over")?.price || "-",
          under: totals?.outcomes.find(o => o.name === "Under")?.price || "-"
        }
      }
    };

    res.status(200).json([game]);

  } catch (err) {
    res.status(500).json({
      error: "Failed to fetch odds",
      details: err.message
    });
  }
}
