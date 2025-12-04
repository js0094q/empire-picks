// propsPanel.js — Top props by EV

const PropsPanel = {
  async show(eventId, btn) {
    const tabs = btn.parentElement.querySelectorAll('.tab-btn');
    tabs.forEach(t => t.classList.remove('active'));
    btn.classList.add('active');

    const linesBox = document.getElementById(`lines-${eventId}`);
    const propsBox = document.getElementById(`props-${eventId}`);

    linesBox.style.display = 'none';
    propsBox.style.display = 'block';
    propsBox.innerHTML = `<div class="loader">Loading props...</div>`;

    try {
      const res = await fetch(`/api/props?eventId=${eventId}`);
      const data = await res.json();

      if (!data || !data.bookmakers || !data.bookmakers.length) {
        propsBox.innerHTML = `<div class="muted">No props available.</div>`;
        return;
      }

      const bm =
        data.bookmakers.find(b => b.key === 'draftkings') ||
        data.bookmakers[0];

      let allProps = [];
      bm.markets.forEach(market => {
        market.outcomes.forEach(out => {
          const prob = impliedProbability(out.price);
          const ev = expectedValue(out.price, prob);
          allProps.push({
            label: out.description || market.key.replace(/_/g, ' '),
            value: `${out.point ?? ''} @ ${out.price}`,
            ev
          });
        });
      });

      allProps = sortPropsByEV(allProps).slice(0, 10);

      propsBox.innerHTML = allProps
        .map(
          p => `
          <div class="team-row">
            <span>${p.label}</span>
            <button class="odd-btn" onclick="addLeg(null,'${eventId}','${p.label}','${p.value}')">
              ${p.value} ${evBadge(p.ev)}
            </button>
          </div>`
        )
        .join('');
    } catch (e) {
      console.error(e);
      propsBox.innerHTML = `<div class="muted">Failed to load props.</div>`;
    }
  }
};

window.PropsPanel = PropsPanel;
