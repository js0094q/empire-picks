// proxy-server.js
import express from "express";
import fetch from "node-fetch";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 8080;

app.use(cors());  // allow all origins — you can restrict if you want

// Proxy route for ESPN odds
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
    res.status(500).json({ error: "Server proxy error", message: err.message });
  }
});

// Optional: Proxy other endpoints or fallback odds API
// e.g. for your backup API you can do similar route /backup-odds

app.listen(PORT, () => {
  console.log(`Proxy server listening on port ${PORT}`);
});
