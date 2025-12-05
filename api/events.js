// =============================================
// /api/events.js — EmpirePicks NFL Events Loader
// =============================================

export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events?apiKey=${apiKey}`;

    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching events", status: r.status });
    }

    const events = await r.json();

    // Optional: upcoming games only (no past games)
    const now = new Date();
    const filtered = events.filter(ev => new Date(ev.commence_time) > now);

    res.status(200).json(filtered);

  } catch (err) {
    console.error("EVENTS API ERROR", err);
    res.status(500).json({ error: "Events handler failed", details: err.message });
  }
}
