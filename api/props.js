// api/props.js

export async function GET(request) {
  const apiKey = process.env.ODDS_API_KEY;
  const { eventId } = Object.fromEntries((new URL(request.url)).searchParams);

  if (!apiKey || !eventId) {
    return new Response(
      JSON.stringify({ error: 'Missing API key or eventId param' }),
      { status: 400 }
    );
  }

  const url = `https://api.the-odds-api.com/v4/sports/americanfootball_nfl/events/${eventId}/odds?apiKey=${apiKey}&regions=us&markets=player_props`;
  try {
    const resp = await fetch(url);
    if (!resp.ok) {
      const txt = await resp.text();
      return new Response(
        JSON.stringify({ error: 'Props API error', status: resp.status, details: txt }),
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
