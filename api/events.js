// /api/events.js
import fetch from "node-fetch";

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SPORT = "americanfootball_nfl";
const REGIONS = "us";
const MARKETS = "h2h,spreads,totals";

const SHARP_BOOKS = ["pinnacle", "betonlineag"];
const PUBLIC_BOOKS = ["draftkings", "fanduel", "betmgm", "caesars"];

function americanToProb(odds) {
  return odds > 0 ? 100 / (odds + 100) : Math.abs(odds) / (Math.abs(odds) + 100);
}

function removeVig(p1, p2) {
  const total = p1 + p2;
  return [p1 / total, p2 / total];
}

function weightedAvg(values) {
  let wSum = 0;
  let total = 0;
  values.forEach(({ v, w }) => {
    wSum += v * w;
    total += w;
  });
  return total ? wSum / total : null;
}

function scoreMarket({ ev, sharpLean, stability }) {
  if (ev < 0.02 || stability < 0.7) return "PASS";
  if (ev > 0.04 && Math.abs(sharpLean) > 0.04) return "PLAY";
  return "PASS";
}

export default async function handler(req, res) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${SPORT}/odds/?apiKey=${ODDS_API_KEY}&regions=${REGIONS}&markets=${MARKETS}`;
    const data = await fetch(url).then(r => r.json());

    const games = data.map(game => {
      const markets = { ml: [], spread: [], total: [] };

      game.bookmakers.forEach(bm => {
        const weight =
          SHARP_BOOKS.includes(bm.key) ? 1.5 :
          PUBLIC_BOOKS.includes(bm.key) ? 1.0 : 0.5;

        bm.markets.forEach(m => {
          if (!["h2h", "spreads", "totals"].includes(m.key)) return;

          const outcomes = m.outcomes;
          if (outcomes.length !== 2) return;

          const pA = americanToProb(outcomes[0].price);
          const pB = americanToProb(outcomes[1].price);
          const [nvA, nvB] = removeVig(pA, pB);

          markets[
            m.key === "h2h" ? "ml" :
            m.key === "spreads" ? "spread" : "total"
          ].push({
            sideA: outcomes[0].name,
            sideB: outcomes[1].name,
            line: outcomes[0].point ?? null,
            priceA: outcomes[0].price,
            priceB: outcomes[1].price,
            probA: nvA,
            probB: nvB,
            weight,
            sharp: SHARP_BOOKS.includes(bm.key),
            book: bm.key
          });
        });
      });

      function aggregateMarket(rows) {
        if (!rows.length) return null;

        const sharp = rows.filter(r => r.sharp);
        const publicRows = rows.filter(r => !r.sharp);

        const sharpProb = weightedAvg(sharp.map(r => ({ v: r.probA, w: r.weight })));
        const publicProb = weightedAvg(publicRows.map(r => ({ v: r.probA, w: r.weight })));

        if (!sharpProb || !publicProb) return null;

        const sharpLean = sharpProb - publicProb;
        const consensusProb = weightedAvg(rows.map(r => ({ v: r.probA, w: r.weight })));

        const best = rows.sort((a, b) =>
          americanToProb(a.priceA) - americanToProb(b.priceA)
        )[0];

        const ev = consensusProb - americanToProb(best.priceA);
        const stability = 1 - Math.abs(sharpLean);

        return {
          pick: best.sideA,
          market: best.line !== null ? "spread/total" : "moneyline",
          line: best.line,
          bestPrice: best.priceA,
          book: best.book,
          sharpProb,
          publicProb,
          sharpLean,
          ev,
          stability,
          decision: scoreMarket({ ev, sharpLean, stability })
        };
      }

      const ml = aggregateMarket(markets.ml);
      const spread = aggregateMarket(markets.spread);
      const total = aggregateMarket(markets.total);

      const bestMarket = [ml, spread, total]
        .filter(m => m && m.decision === "PLAY")
        .sort((a, b) => b.ev - a.ev)[0];

      if (!bestMarket) return null;

      return {
        id: game.id,
        commence_time: game.commence_time,
        home: game.home_team,
        away: game.away_team,
        bestMarket
      };
    }).filter(Boolean);

    res.status(200).json({ games });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
}
