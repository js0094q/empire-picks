// api/events.js
// GUARANTEED NOT TO CRASH
// NO IMPORTS
// NO ENV VARS
// NO EXTERNAL CALLS

module.exports = async (req, res) => {
  res.setHeader("Content-Type", "application/json");

  try {
    res.status(200).json([
      {
        id: "test-game-1",
        commence_time: new Date(Date.now() + 3600000).toISOString(),
        home_team: "Kansas City Chiefs",
        away_team: "Buffalo Bills",
        markets: {
          h2h: {
            testbook: [
              {
                name: "Kansas City Chiefs",
                odds: -140,
                consensus_prob: 0.60,
                ev: 0.05
              },
              {
                name: "Buffalo Bills",
                odds: +120,
                consensus_prob: 0.40,
                ev: -0.03
              }
            ]
          },
          spreads: {
            testbook: [
              {
                name: "Kansas City Chiefs",
                point: -3.5,
                odds: -110,
                consensus_prob: 0.55,
                ev: 0.02
              },
              {
                name: "Buffalo Bills",
                point: +3.5,
                odds: -110,
                consensus_prob: 0.45,
                ev: -0.02
              }
            ]
          },
          totals: {
            testbook: [
              {
                name: "Over",
                point: 47.5,
                odds: -110,
                consensus_prob: 0.52,
                ev: 0.01
              },
              {
                name: "Under",
                point: 47.5,
                odds: -110,
                consensus_prob: 0.48,
                ev: -0.01
              }
            ]
          }
        }
      }
    ]);
  } catch {
    // EVEN IF THIS THROWS, WE STILL RETURN JSON
    res.status(200).json([]);
  }
};
