// api/events.js
import https from 'https';

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  
  // Default to NFL, but allow query param override ?sport=basketball_nba
  const sportKey = req.query.sport || 'americanfootball_nfl'; 
  const regions = 'us'; // us | uk | eu | au
  const markets = 'h2h,spreads'; // Moneyline and Spreads
  const oddsFormat = 'american';
  const dateFormat = 'iso';

  if (!apiKey) {
    return res.status(500).json({ error: 'Missing ODDS_API_KEY environment variable' });
  }

  const url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}&dateFormat=${dateFormat}`;

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let data = '';
        resp.on('data', (chunk) => (data += chunk));
        resp.on('end', () => resolve(JSON.parse(data)));
      }).on('error', (err) => reject(err));
    });

    if (data.message) {
      // API returned an error (e.g., quota exceeded)
      return res.status(400).json({ error: data.message });
    }

    // Transform the data to match our Dashboard UI
    const formattedEvents = data.map((game) => {
      // Find a major bookmaker (e.g., DraftKings or FanDuel) for consistent odds
      const bookmaker = game.bookmakers.find(b => b.key === 'draftkings' || b.key === 'fanduel') || game.bookmakers[0];
      
      let homeOdds = { moneyline: '-', spread: '-' };
      let awayOdds = { moneyline: '-', spread: '-' };

      if (bookmaker) {
        const h2h = bookmaker.markets.find(m => m.key === 'h2h');
        const spreads = bookmaker.markets.find(m => m.key === 'spreads');

        if (h2h) {
          homeOdds.moneyline = h2h.outcomes.find(o => o.name === game.home_team)?.price || '-';
          awayOdds.moneyline = h2h.outcomes.find(o => o.name === game.away_team)?.price || '-';
        }
        if (spreads) {
          const homeOutcome = spreads.outcomes.find(o => o.name === game.home_team);
          const awayOutcome = spreads.outcomes.find(o => o.name === game.away_team);
          
          homeOdds.spread = homeOutcome?.point ? (homeOutcome.point > 0 ? `+${homeOutcome.point}` : homeOutcome.point) : '-';
          awayOdds.spread = awayOutcome?.point ? (awayOutcome.point > 0 ? `+${awayOutcome.point}` : awayOutcome.point) : '-';
        }
      }

      return {
        id: game.id,
        league: sportKey === 'americanfootball_nfl' ? 'NFL' : 'NBA',
        status: 'Upcoming', // The Odds API free tier doesn't always give live score status, defaulting to Upcoming
        time: new Date(game.commence_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        home: { name: game.home_team, score: '-' },
        away: { name: game.away_team, score: '-' },
        odds: {
          home: homeOdds.spread !== '-' ? homeOdds.spread : homeOdds.moneyline,
          away: awayOdds.spread !== '-' ? awayOdds.spread : awayOdds.moneyline
        }
      };
    });

    res.status(200).json(formattedEvents);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch events', details: error.message });
  }
}
