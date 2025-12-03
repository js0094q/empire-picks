export default async function handler(req, res) {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Missing ODDS_API_KEY" });
    }

    const url =
      `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/odds/?` +
      `apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`;

    const r = await fetch(url);

    if (!r.ok) {
      return res.status(500).json({ error: "Failed fetching NFL odds" });
    }

    const games = await r.json();

    // --------------------------------------------------
    // SAME WINDOW AS EVENTS
    // --------------------------------------------------

   const now = new Date();

const todayUTC = new Date(Date.UTC(
  now.getUTCFullYear(),
  now.getUTCMonth(),
  now.getUTCDate()
));

const todayUTCDay = todayUTC.getUTCDay();
const daysSinceThursday = (todayUTCDay - 4 + 7) % 7;

const weekStart = new Date(todayUTC);
weekStart.setUTCDate(todayUTC.getUTCDate() - daysSinceThursday);

const weekEnd = new Date(weekStart);
weekEnd.setUTCDate(weekStart.getUTCDate() + 5);
weekEnd.setUTCHours(11, 0, 0, 0);

const nextWeekStart = new Date(weekEnd);

const nextWeekEnd = new Date(nextWeekStart);
nextWeekEnd.setUTCDate(nextWeekStart.getUTCDate() + 3);
nextWeekEnd.setUTCHours(23, 59, 59, 999);

const filtered = (data || []).filter(game => {
  const kickoff = new Date(game.commence_time);
  return kickoff >= weekStart && kickoff <= nextWeekEnd;
});
