// api/odds.js

/** Vercel serverless function: proxies calls to The Odds API, using backend-stored API key */

export async function GET(request) {
  const SPORT = 'americanfootball_nfl';
  const REGIONS = 'us';
  const MARKETS = ['h2h','spreads','totals'];  // add props separately if needed
  const apiKey = process.env.ODDS_API_KEY;    // must be set via Vercel env var

  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: 'Missing API key' }),
      { status: 500 }
    );
  }

  const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds?apiKey=${apiKey}&regions=${REGIONS}&markets=${MARKETS.join(',')}`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(
        JSON.stringify({ error: 'Odds API error', status: resp.status, details: txt }),
        { status: resp.status }
      );
    }
    const data = await resp.json();
    return Response.json(data);
  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Fetch failed', message: err.message }),
      { status: 500 }
    );
  }
}
