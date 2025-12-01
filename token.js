// ========================================================
// Simple, stable token system for EmpirePicks Beta Login
// Works on static Vercel hosting, no backend needed.
// ========================================================

// 6 hour expiration (in milliseconds)
const EXP_MS = 6 * 60 * 60 * 1000;

// YOUR approved invite codes:
const VALID_INVITE_CODES = [
  "EMPIRE-BETA-01",
  "NFL-ACCESS",
  "TESTER-JS",
];

// Create a hash (stable string transform)
function hash(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString();
}

// Create a signed token the app can verify later
export function createToken(inviteCode){
  if (!VALID_INVITE_CODES.includes(inviteCode)) {
    return null;
  }

  const payload = {
    code: inviteCode,
    ts: Date.now(),
    exp: Date.now() + EXP_MS
  };

  const signature = hash(JSON.stringify(payload) + "EMPIREPICKS_SECRET");

  return btoa(JSON.stringify({ payload, signature }));
}

// Validate the token from localStorage
export function validateToken(){
  const t = localStorage.getItem("EP_TOKEN");
  if (!t) return false;

  try {
    const { payload, signature } = JSON.parse(atob(t));

    // Check expiration
    if (Date.now() > payload.exp) return false;

    // Check signature integrity
    const expected = hash(JSON.stringify(payload) + "EMPIREPICKS_SECRET");
    if (expected !== signature) return false;

    // Check invite code is still valid
    if (!VALID_INVITE_CODES.includes(payload.code)) return false;

    return true;
  } catch (e){
    return false;
  }
}
