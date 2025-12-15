<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>EmpirePicks • NFL Odds & Props</title>

  <link rel="stylesheet" href="styles.css" />
  <script type="module" src="script.js" defer></script>
</head>

<body>
  <header class="ep-header">
    <div class="logo">🏛️ EmpirePicks</div>
    <button id="refresh-btn">Refresh Odds</button>
  </header>

  <div class="layout">
    <aside class="left-rail">
      <section id="top-picks" class="top-picks"></section>
    </aside>

    <main class="main-content">
      <section class="hero">
        <h1>EmpirePicks</h1>
        <p>Consensus odds, no-vig probabilities, model-weighted value.</p>
      </section>

      <div id="games-container" class="games-container">
        <div class="loading">Loading NFL games…</div>
      </div>
    </main>
  </div>

  <footer class="ep-footer">
    Data from The Odds API • EmpirePicks.com
  </footer>

  <!-- Parlay modal -->
  <div class="parlay-backdrop" id="parlay-backdrop"></div>
  <div class="parlay-modal" id="parlay-modal">
    <h2>Parlay Builder</h2>
    <div id="parlay-legs" class="parlay-legs"></div>
    <div id="parlay-summary" class="parlay-summary"></div>
    <input type="number" id="parlay-stake" placeholder="Stake $" />
    <button id="close-parlay">Close</button>
  </div>
</body>
</html>
