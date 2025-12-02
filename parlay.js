// ========================================================
//  EMPIREPICKS PARLAY MAKER
//  - Supports ML + PROP legs
//  - Pure front-end, no imports
// ========================================================

// ---------- Helpers ----------
function americanToDecimal(o) {
  return o > 0 ? 1 + o / 100 : 1 + 100 / -o;
}

function formatAmerican(o) {
  return o > 0 ? `+${o}` : `${o}`;
}

// ---------- State ----------
const parlayLegs = [];

const legsEl   = document.querySelector("#parlayLegs");
const calcEl   = document.querySelector("#parlayCalc");
const clearBtn = document.querySelector("#clearParlay");

// Safeguard: if markup is missing, bail quietly
if (!legsEl || !calcEl || !clearBtn) {
  console.warn("[Parlay] Missing parlayMaker elements in DOM.");
}

// ========================================================
//  EVENT WIRING
// ========================================================

// Global handler for “➕ Add” buttons (ML + Props)
document.body.addEventListener("click", e => {
  const btn = e.target.closest(".add-leg");
  if (!btn) return;

  const market = btn.dataset.market;

  let leg;

  if (market === "ML") {
    leg = {
      market: "ML",
      team: btn.dataset.team,
      price: Number(btn.dataset.price),
      trueProb: Number(btn.dataset.trueprob),
      game: btn.dataset.game
    };
  } else if (market === "PROP") {
    leg = {
      market: "PROP",
      player: btn.dataset.player,
      type: btn.dataset.type,
      side: btn.dataset.side,
      point: Number(btn.dataset.point),
      price: Number(btn.dataset.price),
      trueProb: Number(btn.dataset.trueprob),
      game: btn.dataset.game
    };
  } else {
    // Unknown market type, ignore
    return;
  }

  // Optional rule: limit to one leg per game (prevents dumb correlateds)
  if (parlayLegs.some(l => l.game === leg.game)) {
    alert("You already have a leg from this game in your parlay.");
    return;
  }

  parlayLegs.push(leg);
  renderParlaySlip();
});

// Clear entire parlay
if (clearBtn) {
  clearBtn.addEventListener("click", () => {
    parlayLegs.length = 0;
    renderParlaySlip();
  });
}

// Expose removal for ✖ buttons
window.removeLeg = function(idx) {
  parlayLegs.splice(idx, 1);
  renderParlaySlip();
};

// ========================================================
//  RENDER PARLAY SLIP
// ========================================================
function renderParlaySlip() {
  if (!legsEl || !calcEl) return;

  if (!parlayLegs.length) {
    legsEl.innerHTML = `<em style="color:var(--muted);">No legs added yet.</em>`;
    calcEl.textContent = "Add legs to calculate EV…";
    return;
  }

  legsEl.innerHTML = parlayLegs
    .map((l, i) => {
      let mainLine = "";
      let subLine  = "";

      if (l.market === "ML") {
        mainLine = `<strong>${l.team}</strong> Moneyline`;
        subLine  = l.game;
      } else if (l.market === "PROP") {
        const typeLabel = (l.type || "")
          .replace("player_", "")
          .replace(/_/g, " ");
        mainLine = `<strong>${l.player}</strong> ${l.side} ${l.point} <span style="color:#9ca7c8;">${typeLabel}</span>`;
        subLine  = l.game;
      }

      return `
        <div style="
          padding:8px 6px;
          border-bottom:1px solid var(--border);
          font-size:0.88rem;
          position:relative;
        ">
          <div>
            ${mainLine}
            <br>
            <span style="color:#fff;">${formatAmerican(l.price)}</span>
          </div>
          <div style="color:#9ca7c8;font-size:0.8rem;margin-top:2px;">
            ${subLine}
          </div>

          <button
            onclick="removeLeg(${i})"
            style="
              position:absolute;
              top:6px;
              right:6px;
              background:none;
              border:1px solid var(--border);
              border-radius:4px;
              padding:0 5px;
              color:#f55;
              cursor:pointer;
              font-size:0.75rem;
            "
          >
            ✖
          </button>
        </div>
      `;
    })
    .join("");

  calcParlayEV();
}

// ========================================================
//  EV CALCULATION
// ========================================================
function calcParlayEV() {
  if (!calcEl) return;

  if (parlayLegs.length < 2) {
    calcEl.innerHTML =
      `<em style="color:var(--muted);">Add 2 or more legs to calculate parlay EV.</em>`;
    return;
  }

  let trueProb = 1;
  let decOdds  = 1;

  parlayLegs.forEach(l => {
    const p  = Number(l.trueProb) || 0;
    const ao = Number(l.price) || 0;

    trueProb *= p;
    decOdds  *= americanToDecimal(ao);
  });

  const impliedProb = decOdds > 0 ? 1 / decOdds : 0;
  const edge        = trueProb - impliedProb;

  calcEl.innerHTML = `
    <div style="margin-top:8px;color:#fff;font-size:0.9rem;">
      <div>
        <strong style="color:var(--gold);">True Hit Rate:</strong>
        ${(trueProb * 100).toFixed(2)}%
      </div>
      <div>
        <strong style="color:var(--gold);">Implied Probability:</strong>
        ${(impliedProb * 100).toFixed(2)}%
      </div>
      <div style="margin-top:4px;">
        <strong style="color:${edge >= 0 ? "var(--green)" : "var(--red)"};">
          EV Edge: ${(edge * 100).toFixed(2)}%
        </strong>
      </div>
      <div style="margin-top:4px;color:var(--muted);font-size:0.8rem;">
        Decimal Odds: ${decOdds.toFixed(3)}
      </div>
    </div>
  `;
}
