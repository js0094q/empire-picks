/* =========================================================
   NHL GAME NARRATIVE
   ========================================================= */

function nhlNarrative(game) {
  const mlH = game.best?.ml?.home;
  const mlA = game.best?.ml?.away;
  const puckH = game.best?.puck?.home;
  const puckA = game.best?.puck?.away;
  const totO = game.best?.total?.over;
  const totU = game.best?.total?.under;

  const lines = [];

  if (mlH && mlA) {
    const lean = mlH.consensus_prob > mlA.consensus_prob
      ? game.home_team
      : game.away_team;
    lines.push(`Moneyline leans toward ${lean}.`);
  }

  if (puckH && puckA) {
    const puckValue =
      puckH.ev > puckA.ev
        ? `${game.home_team} ${puckH.point}`
        : `${game.away_team} ${puckA.point}`;
    lines.push(`Puck line value appears strongest on ${puckValue}.`);
  }

  if (totO && totU) {
    const totLean = totO.consensus_prob > totU.consensus_prob
      ? `Over ${totO.point}`
      : `Under ${totU.point}`;
    lines.push(`Total goals market leans ${totLean}.`);
  }

  return `
    <div class="muted" style="margin:10px 0;font-size:0.8rem;line-height:1.45">
      ${lines.join(" ")}
    </div>
  `;
}
