// Lightweight client-side JWT-like token signing

import { sha256 } from "https://esm.sh/@noble/hashes@1.3.2/sha256";

// The secret is injected by Vercel using middleware
const SECRET = window.__EP_SECRET;

// 6-hour tokens
const EXP_MS = 6 * 60 * 60 * 1000;

export async function createToken(inviteCode) {
  // Replace this with real approval logic
  const validCodes = ["EMPIRE-BETA-01", "TESTER-JS", "NFL-ACCESS"];  

  if (!validCodes.includes(inviteCode)) return null;

  const payload = {
    invite: inviteCode,
    ts: Date.now(),
    exp: Date.now() + EXP_MS
  };

  const sig = sign(JSON.stringify(payload));
  return btoa(JSON.stringify({ payload, sig }));
}

export function validateToken() {
  const t = localStorage.getItem("EP_TOKEN");
  if (!t) return false;

  try {
    const { payload, sig } = JSON.parse(atob(t));
    if (sig !== sign(JSON.stringify(payload))) return false;
    if (Date.now() > payload.exp) return false;
    return true;
  } catch {
    return false;
  }
}

function sign(str) {
  const bytes = new TextEncoder().encode(SECRET + str);
  const hash = sha256(bytes);
  return Array.from(hash).map(b=>b.toString(16).padStart(2,"0")).join("");
}
