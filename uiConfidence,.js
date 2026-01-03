// uiConfidence.js
export function getConfidenceMeta({ sharpLean, ev, stability, decision }) {
  if (decision !== "PLAY") {
    return {
      label: "No Edge",
      class: "badge-pass",
      arrow: null
    };
  }

  if (ev > 0.05 && stability > 0.8) {
    return {
      label: "Best Choice",
      class: "badge-best",
      arrow: sharpLean > 0 ? "↑" : "↓"
    };
  }

  if (ev > 0.03) {
    return {
      label: "Best Value",
      class: "badge-value",
      arrow: sharpLean > 0 ? "↑" : "↓"
    };
  }

  return {
    label: "Market Lean",
    class: "badge-lean",
    arrow: sharpLean > 0 ? "↑" : "↓"
  };
}
