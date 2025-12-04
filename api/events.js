// ============================================================
// /api/events.js — EmpirePicks v1.0
// Secure backend (server-only) events + odds feed
// ============================================================

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
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) throw new Error("Odds API responded with error status");

    const json = await r.json();

    if (!Array.isArray(json)) {
      return res.status(500).json({ error: "Invalid odds response", payload: json });
    }

    const events = json.map(game => {
      // choose bookmaker priority: DK → FD → first available
      const book =
        game.bookmakers.find(b => b.key === "draftkings") ||
        game.bookmakers.find(b => b.key === "fanduel") ||
        game.bookmakers[0];

      let homeSpread = "-";
      let awaySpread = "-";

      if (book) {
        const spreads = book.markets?.find(m => m.key === "spreads");

        if (spreads && spreads.outcomes) {
          const h = spreads.outcomes.find(o => o.name === game.home_team);
          const a = spreads.outcomes.find(o => o.name === game.away_team);

          homeSpread = formatSpread(h?.point);
          awaySpread = formatSpread(a?.point);
        }
      }

      return {
        id: game.id,
        away: { name: game.away_team },
        home: { name: game.home_team },

        time: new Date(game.commence_time).toLocaleTimeString([], {
          hour: "2-digit",
          minute: "2-digit"
        }),

        odds: {
          home: homeSpread,
          away: awaySpread
        }
      };
    });

    res.status(200).json(events);

  } catch (err) {
    console.error("EVENTS API ERROR:", err);
    res.status(500).json({
      error: "Failed to fetch events",
      details: err.message
    });
  }
}

// ============================================================
// Utilities
// ============================================================

function formatSpread(val) {
  if (val === undefined || val === null) return "-";
  if (val === 0 || val === 0.0) return "PK";
  return val > 0 ? `+${val}` : `${val}`;
}
