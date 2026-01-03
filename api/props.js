import fetch from "node-fetch";

const API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";

const SHARP_BOOKS = {
  pinnacle: 1.6,
  betonlineag: 1.35,
};

const PUBLIC_BOOKS = {
  fanduel: 1.0,
  draftkings: 1.0,
  betmgm: 0.95,
  caesars: 0.9,
};

const IMPLIED = o => (o > 0 ? 100 / (o + 100) : -o / (-o + 100));
const NO_VIG = p => {
  const s = p.reduce((a, b) => a + b, 0);
  return p.map(x => x / s);
};

export default async function handler(req, res) {
  try {
    const eventId = req.query.eventId;
    if (!eventId) return res.status(400).json([]);

    const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/events/${eventId}/odds?apiKey=${API_KEY}&regions=us&markets=player_pass_yds,player_rush_yds,player_receptions&oddsFormat=american`;

    const r = await fetch(url);
    const data = await r.json();

    const props = [];

    data.bookmakers.forEach(b => {
      const weight =
        SHARP_BOOKS[b.key] ?? PUBLIC_BOOKS[b.key] ?? null;
      if (!weight) return;

      b.markets.forEach(m => {
        m.outcomes.forEach(o => {
          props.push({
            player: o.description,
            stat: m.key,
            side: o.name,
            line: o.point,
            price: o.price,
            prob: IMPLIED(o.price),
            weight,
            book: b.key,
          });
        });
      });
    });

    const grouped = {};
    props.forEach(p => {
      const k = `${p.player}|${p.stat}|${p.line}`;
      if (!grouped[k]) grouped[k] = [];
      grouped[k].push(p);
    });

    const results = [];

    Object.values(grouped).forEach(entries => {
      const sharp = entries.filter(e => SHARP_BOOKS[e.book]);
      const pub = entries.filter(e => PUBLIC_BOOKS[e.book]);

      if (sharp.length < 1 || pub.length < 2) return;

      const sharpProb =
        NO_VIG(sharp.map(e => e.prob)).reduce(
          (a, p, i) => a + p * sharp[i].weight,
          0
        ) /
        sharp.reduce((a, b) => a + b.weight, 0);

      const pubProb =
        NO_VIG(pub.map(e => e.prob)).reduce(
          (a, p, i) => a + p * pub[i].weight,
          0
        ) /
        pub.reduce((a, b) => a + b.weight, 0);

      const lean = sharpProb - pubProb;

      const best = entries.reduce((a, b) =>
        IMPLIED(b.price) < IMPLIED(a.price) ? b : a
      );

      const payout =
        best.price > 0 ? best.price / 100 : 100 / Math.abs(best.price);

      const ev = sharpProb * payout - 1;

      if (ev < 0.04 || Math.abs(lean) < 0.025) return;

      results.push({
        player: best.player,
        stat: best.stat,
        side: best.side,
        line: best.line,
        price: best.price,
        book: best.book,
        sharpLean: lean,
        ev,
        stability: sharp.length / entries.length,
        decision: "PLAY",
        direction: lean > 0 ? "SHARP_OVER" : "SHARP_UNDER",
      });
    });

    res.status(200).json(results);
  } catch (e) {
    console.error(e);
    res.status(500).json([]);
  }
}
