// /api/props.js
import fetch from "node-fetch";
import {
  americanToProb,
  removeVig,
  confidenceScore,
  decisionGate,
  directionArrow
} from "./math.js";

const API_KEY = process.env.ODDS_API_KEY;
const BASE_URL = "https://api.the-odds-api.com/v4";
const SPORT = "americanfootball_nfl";

/**
 * Sharp vs public book classification
 * Keep this small and opinionated
 */
const SHARP_BOOKS = ["pinnacle", "betonlineag", "circa"];
const PUBLIC_BOOKS = ["fanduel", "draftkings", "betmgm", "caesars"];

/**
 * Player prop markets we care about
 * (expand later, each market costs quota)
 */
const PROP_MARKETS = [
  "player_pass_yds",
  "player_pass_tds",
  "player_rush_yds",
  "player_receptions",
  "player_anytime_td"
];

export default async function handler(req, res) {
  try {
    const eventId = req.query.id;
    if (!eventId) {
      return res.status(400).json({ error: "Missing event id" });
    }

    const url =
      `${BASE_URL}/sports/${SPORT}/events/${eventId}/odds` +
      `?regions=us` +
      `&markets=${PROP_MARKETS.join(",")}` +
      `&oddsFormat=american` +
      `&apiKey=${API_KEY}`;

    const r = await fetch(url);
    if (!r.ok) throw new Error("Odds API event props request failed");

    const event = await r.json();
    const results = [];

    for (const bookmaker of event.bookmakers || []) {
      for (const market of bookmaker.markets || []) {
        // Group outcomes by player + line
        const buckets = {};

        for (const o of market.outcomes || []) {
          if (!o.description || o.point == null) continue;

          const key = `${o.description}|${o.point}`;
          if (!buckets[key]) buckets[key] = [];
          buckets[key].push({
            player: o.description,
            side: o.name, // Over / Under
            line: o.point,
            odds: o.price,
            book: bookmaker.key
          });
        }

        for (const bucket of Object.values(buckets)) {
          if (bucket.length < 2) continue;

          // Remove vig between Over / Under
          const odds = bucket.map(b => b.odds);
          const probs = removeVig(odds);
          bucket.forEach((b, i) => (b.prob = probs[i]));

          const sharp = bucket.filter(b =>
            SHARP_BOOKS.includes(b.book)
          );
          const publicBooks = bucket.filter(b =>
            PUBLIC_BOOKS.includes(b.book)
          );

          if (!sharp.length || !publicBooks.length) continue;

          const sharpProb =
            sharp.reduce((a, b) => a + b.prob, 0) / sharp.length;

          const publicProb =
            publicBooks.reduce((a, b) => a + b.prob, 0) /
            publicBooks.length;

          const lean = sharpProb - publicProb;

          // Best price (max payout)
          const best = bucket.reduce((a, b) =>
            b.odds > a.odds ? b : a
          );

          const ev =
            sharpProb *
              (best.odds > 0
                ? best.odds / 100
                : 100 / Math.abs(best.odds)) -
            (1 - sharpProb);

          const score = confidenceScore({
            lean,
            ev,
            bookCount: bucket.length
          });

          const decision = decisionGate(score);
          if (decision === "PASS") continue;

          results.push({
            id: `${eventId}-${market.key}-${best.player}-${best.side}`,
            gameId: eventId,

            player: best.player,
            market: market.key,
            side: best.side,
            line: best.line,
            odds: best.odds,
            book: best.book,

            sharpProb,
            publicProb,
            lean,

            confidenceScore: score,
            decision,
            direction: directionArrow(lean),

            badges: {
              marketLean: Math.abs(lean) >= 0.03,
              bestValue: ev >= 0.03,
              stable: bucket.length >= 4
            }
          });
        }
      }
    }

    res.status(200).json({ props: results });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "props_failed" });
  }
}
