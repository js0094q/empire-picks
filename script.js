// script.js — UPDATED for working odds + EV + parlay buttons + original card layout preserved

// ----- UTILITY FUNCTIONS for odds ↔ probability/EV -----
function impliedProbabilityFromAmerican(odds) {
  odds = Number(odds);
  if (odds > 0) {
    return 100 / (odds + 100);
  } else {
    const pos = -odds;
    return pos / (pos + 100);
  }
}

function decimalFromAmerican(odds) {
  odds = Number(odds);
  if (odds > 0) {
    return (odds / 100) + 1;
  } else {
    return (100 / (-odds)) + 1;
  }
}

function expectedValue(myProb, odds, stake = 1) {
  const dec = decimalFromAmerican(odds);
  const profitIfWin = dec * stake - stake;
  return myProb * profitIfWin - (1 - myProb) * stake;
}

// Replace this with your actual model logic
function modelEstimatedProbability(game, outcomeName, marketKey) {
  // TEMP placeholder — naive 50% for all
  // You should swap this with your model or manual input
  return 0.5;
}

// ----- MAIN LOAD / RENDER FUNCTION -----
async function loadOddsAndRender() {
  try {
    const events = window.APP_EVENTS || [];  // or whatever variable holds events
    const oddsMap = window.APP_ODDS || {};    // odds indexed by event ID

    const container = document.getElementById("games-container");
    container.innerHTML = "";  // clear

    for (const game of events) {
      const oddsData = oddsMap[game.id];
      if (!oddsData) continue;

      const card = document.createElement("div");
      card.className = "game-card";  // preserve original class

      // Teams header (keep your gradient / team-color styling)
      const teamsDiv = document.createElement("div");
      teamsDiv.className = "teams-header";
      teamsDiv.innerHTML = `
        <div class="team away">${game.away_team}</div>
        <div class="team home">${game.home_team}</div>
      `;
      card.appendChild(teamsDiv);

      // Odds markets (Moneyline, Spread, Total, Props if exist)
      oddsData.bookmakers.forEach(bookmaker => {
        bookmaker.markets.forEach(market => {
          market.outcomes.forEach(outcome => {
            // create a row similar to old layout
            const row = document.createElement("div");
            row.className = "odds-row";

            const outcomeLabel = document.createElement("span");
            outcomeLabel.className = "outcome-label";
            outcomeLabel.textContent = `${outcome.name}`;

            const oddsLabel = document.createElement("span");
            oddsLabel.className = "odds-label";
            oddsLabel.textContent = (outcome.price > 0 ? "+" + outcome.price : outcome.price);

            // compute implied prob, your model prob, EV
            const impProb = impliedProbabilityFromAmerican(outcome.price);
            const myP = modelEstimatedProbability(game, outcome.name, market.key);
            const ev = expectedValue(myP, outcome.price);

            const probSpan = document.createElement("span");
            probSpan.className = "probability-label";
            probSpan.textContent = `MyP ${(myP*100).toFixed(1)}%`;

            row.append(outcomeLabel, oddsLabel, probSpan);

            if (ev > 0) {
              row.classList.add("value-bet");
              const badge = document.createElement("span");
              badge.className = "ev-badge";
              badge.textContent = `+EV ${(ev*100).toFixed(1)}%`;
              row.append(badge);
            }

            // Parlay add button
            const btn = document.createElement("button");
            btn.className = "add-leg";
            btn.textContent = "Add to Parlay";
            btn.onclick = () => {
              window.addParlayLeg({
                gameId: game.id,
                market: market.key,
                outcome: outcome.name,
                odds: outcome.price,
                home: game.home_team,
                away: game.away_team
              });
            };
            row.append(btn);

            card.appendChild(row);
          });
        });
      });

      // Kickoff info
      const kickoff = document.createElement("div");
      kickoff.className = "kickoff-info";
      kickoff.textContent = `Kickoff: ${new Date(game.commence_time).toLocaleString()}`;
      card.appendChild(kickoff);

      container.appendChild(card);
    }

    // After rendering games — update parlay panel
    if (window.renderParlay) window.renderParlay();

  } catch (err) {
    console.error("Error rendering odds:", err);
  }
}

// Hook into existing data load — you might call this at end of your fetching logic
window.onload = () => {
  loadOddsAndRender();
};
