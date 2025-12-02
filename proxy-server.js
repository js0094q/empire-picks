// proxy-server.js

import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());  // allow all origins (for dev / testing)

app.get("/espn-odds/:eventId", async (req, res) => {
  const { eventId } = req.params;
  const url = `https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/${eventId}/competitions/${eventId}/odds`;

  try {
    const r = await fetch(url);
    if (!r.ok) {
      res.status(r.status).json({ error: "ESPN fetch failed", status: r.status });
      return;
    }
    const data = await r.json();
    res.json(data);
  } catch (err) {
    console.error("Proxy error fetching ESPN odds:", err);
    res.status(500).json({ error: "Proxy error", message: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Proxy listening on port ${PORT}`);
});
