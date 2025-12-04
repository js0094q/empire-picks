// api/odds.js
import https from 'https';

export default async function handler(req, res) {
  const apiKey = process.env.ODDS_API_KEY;
  const sportKey = req.query.sport || 'americanfootball_nfl';
  const eventId = req.query.eventId; // Optional: Fetch for specific game only
  
  // We fetch 'totals' (Over/Under) and 'h2h' (Moneyline) here
  const markets = 'h2h,totals'; 
  const regions = 'us';
  const oddsFormat = 'american';

  if (!apiKey) {
    return res.status(500).json({ error: 'Missing ODDS_API_KEY' });
  }

  // Build URL based on whether we want one event or all
  let url = `https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;
  
  if (eventId) {
    url = `https://api.the-odds-api.com/v4/sports/${sportKey}/events/${eventId}/odds?apiKey=${apiKey}&regions=${regions}&markets=${markets}&oddsFormat=${oddsFormat}`;
  }

  try {
    const data = await new Promise((resolve, reject) => {
      https.get(url, (resp) => {
        let data = '';
        resp.on('data', (chunk) => (data += chunk));
        resp.on('end', () => resolve(JSON.parse(data)));
      }).on('error', (err) => reject(err));
    });

    if (data.message) {
      return res.status(400).json({ error: data.message });
    }

    // If fetching a single event, the API returns an object. If multiple, an array.
    // We normalize to an array for easier processing.
    const events = Array.isArray(data) ? data : [data];

    const cleanedOdds = events.map((game) => {
      const bookmaker = game.bookmakers.find(b => b.key === 'draftkings' || b.key === 'fanduel') || game.bookmakers[0];
      
      let markets = {
        h2h: null,
        totals: null
      };

      if (bookmaker) {
        const h2hRaw = bookmaker.markets.find(m => m.key === 'h2h');
        const totalsRaw = bookmaker.markets.find(m => m.key === 'totals');

        if (h2hRaw) {
          markets.h2h = {
            home: h2hRaw.outcomes.find(o => o.name === game.home_team)?.price,
            away: h2hRaw.outcomes.find(o => o.name === game.away_team)?.price
          };
        }

        if (totalsRaw) {
          // Usually takes the first available line
          const over = totalsRaw.outcomes.find(o => o.name === 'Over');
          const under = totalsRaw.outcomes.find(o => o.name === 'Under');
          markets.totals = {
            points: over?.point,
            over: over?.price,
            under: under?.price
          };
        }
      }

      return {
        id: game.id,
        startTime: game.commence_time,
        odds: markets
      };
    });

    res.status(200).json(cleanedOdds);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch odds', details: error.message });
  }
}
