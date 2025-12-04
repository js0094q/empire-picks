// ============================================================
// propsPanel.js — EmpirePicks v1.0
// ============================================================

import { impliedProbability, expectedValue, sortPropsByEV } from "./helpers.js";
import { evBadge } from "./ui.js";

export const PropsPanel = {
  async show(eventId, btn) {
    const tabs = btn.parentElement.querySelectorAll(".tab-btn");
    tabs.forEach(t => t.classList.remove("active"));
    btn.classList.add("active");

    document.getElementById(`lines-${eventId}`).style.display = "none";
    document.getElementById(`props-${eventId}`).style.display = "block";

    const box = document.getElementById(`props-${eventId}`);
    box.innerHTML = `<div class="loader">Loading player props...</div>`;

    const res = await fetch(`/api/props?eventId=${eventId}`);
    const data = await res.json();

    if (!data || !data.bookmakers || !data.bookmakers.length) {
      box.innerHTML = `<div class="muted">No props available.</div>`;
      return;
    }

    const bm = data.bookmakers.find(b => b.key === "draftkings") || data.bookmakers[0];

    let allProps = [];

    bm.markets.forEach(market => {
      market.outcomes.forEach(out => {
        const prob = impliedProbability(out.price);
        const ev = expectedValue(out.price, prob);

        allProps.push({
          label: out.description || market.key.replace(/_/g, " "),
          value: `${out.point || ''} @ ${out.price}`,
          ev
        });
      });
    });

    const top = sortPropsByEV(allProps).slice(0, 10);

    box.innerHTML = top
      .map(p => `
      <div class="team-row">
        <span>${p.label}</span>
        <button class="odd-btn" onclick="window.addLeg(null,'${eventId}','${p.label}','${p.value}')">
          ${p.value} ${evBadge(p.ev)}
        </button>
      </div>
    `)
      .join('');
  }
};

window.PropsPanel = PropsPanel;
