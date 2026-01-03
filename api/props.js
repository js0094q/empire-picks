// /api/props.js
import fetch from "node-fetch";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "player_pass_yds,player_receptions";

const SHARP_BOOKS = ["pinnacle", "betonlineag"];

function americanToProb(o) {
  return o > 0 ? 100 / (o + 100) : Math.abs(o) / (Math.abs(o) + 100);
}

export default async function handler(req, res) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGIONS}&markets=${MARKETS}`;
    const data = await fetch(url).then(r => r.json());

    const props = [];

    data.forEach(game => {
      game.bookmakers.forEach(bm => {
        const sharp = SHARP_BOOKS.includes(bm.key);
        bm.markets.forEach(m => {
          m.outcomes.forEach(o => {
            const prob = americanToProb(o.price);
            props.push({
              gameId: game.id,
              player: o.name,
              market: m.key,
              side: o.description,
              line: o.point,
              price: o.price,
              prob,
              sharp,
              book: bm.key
            });
          });
        });
      });
    });

    const grouped = {};
    props.forEach(p => {
      const k = `${p.gameId}-${p.player}-${p.market}-${p.line}-${p.side}`;
      grouped[k] = grouped[k] || [];
      grouped[k].push(p);
    });

    const results = Object.values(grouped).map(rows => {
      const sharp = rows.filter(r => r.sharp);
      const publicRows = rows.filter(r => !r.sharp);

      if (!sharp.length || !publicRows.length) return null;

      const sharpProb = sharp.reduce((a, b) => a + b.prob, 0) / sharp.length;
      const publicProb = publicRows.reduce((a, b) => a + b.prob, 0) / publicRows.length;

      const sharpLean = sharpProb - publicProb;
      const best = rows.sort((a, b) => americanToProb(a.price) - americanToProb(b.price))[0];
      const ev = sharpProb - americanToProb(best.price);
      const stability = 1 - Math.abs(sharpLean);

      const decision =
        ev > 0.025 && stability > 0.75 ? "PLAY" : "PASS";

      if (decision !== "PLAY") return null;

      return {
        gameId: best.gameId,
        player: best.player,
        market: best.market,
        side: best.side,
        line: best.line,
        bestPrice: best.price,
        book: best.book,
        sharpLean,
        ev,
        stability,
        decision
      };
    }).filter(Boolean);

    res.status(200).json({ props: results });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
