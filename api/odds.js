export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "Missing ODDS_API_KEY" });

  const base = "https://api.the-odds-api.com/v4";
  const sport = "americanfootball_nfl";
  const regions = "us";
  const markets = "h2h,spreads,totals";

  const url = `${base}/sports/${sport}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=american`;

  try {
    const r = await fetch(url);
    const data = await r.json();
    const remaining = r.headers.get("x-requests-remaining");

   const now = new Date();

const thisTuesday = new Date(now);
thisTuesday.setDate(now.getDate() - ((now.getDay() + 6) % 7));
thisTuesday.setHours(0, 0, 0, 0);

const nextMonday = new Date(thisTuesday);
nextMonday.setDate(thisTuesday.getDate() + 6);
nextMonday.setHours(23, 59, 59, 999);

games = games.filter(g => {
  const d = new Date(g.commence_time);
  return d >= thisTuesday && d <= nextMonday;
});
