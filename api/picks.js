// /api/picks.js — Vercel serverless function
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { user_id, team, player, type, line, odds, ev_score } = req.body;

    try {
      const result = await pool.query(
        `INSERT INTO picks (user_id, team, player, type, line, odds, ev_score)
         VALUES ($1, $2, $3, $4, $5, $6, $7)
         RETURNING *`,
        [user_id, team, player, type, line, odds, ev_score]
      );
      res.status(200).json(result.rows[0]);
    } catch (e) {
      console.error("DB Insert Error:", e);
      res.status(500).json({ error: "Insert failed" });
    }

  } else if (req.method === 'GET') {
    try {
      const { rows } = await pool.query(`SELECT * FROM picks ORDER BY created_at DESC LIMIT 30`);
      res.status(200).json(rows);
    } catch (e) {
      res.status(500).json({ error: "Read failed" });
    }

  } else {
    res.status(405).end();
  }
}
