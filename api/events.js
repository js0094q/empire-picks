// /api/events.js — merged EVENTS + ODDS for 7-day window

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";

  const eventsURL = `${base}/sports/${sport}/events?apiKey=${apiKey}`;
  const oddsURL   = `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

  try {
    // Fetch in parallel
    const [evR, oddsR] = await Promise.all([ fetch(eventsURL), fetch(oddsURL) ]);
    const events = await evR.json();
    const oddsData = await oddsR.json();

    const now = Date.now();
    const cutoff = now + 7 * 24 * 60 * 60 * 1000; // rolling 7-day window

    // Index odds by event ID
    const oddsById = Object.fromEntries(
      (oddsData || []).map(game => [game.id, game])
    );

    // Merge events + odds + filter window
    const merged = events
      .filter(ev => {
        const ko = new Date(ev.commence_time).getTime();
        return ko >= now && ko <= cutoff;
      })
      .map(ev => ({
        ...ev,
        bookmakers: oddsById[ev.id]?.bookmakers || []
      }));

    res.status(200).json(merged);

  } catch (err) {
    console.error("EVENT MERGE ERROR:", err);
    res.status(500).json({ error: err.message });
  }
}
