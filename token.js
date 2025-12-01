// ========================================================
// EmpirePicks Beta Access Token System (Hash-Based)
// No backend. Stable on Vercel static hosting.
// ========================================================

// Token lifespan (6 hours)
const EXP_MS = 6 * 60 * 60 * 1000;

// Approved invite codes:
const VALID_INVITE_CODES = [
  "EMPIRE-BETA-01",
  "NFL-ACCESS",
  "TESTER-JS",
];

// Simple non-cryptographic stable string hash
function hash(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0; // force 32-bit
  }
  return h.toString();
}

// Create token containing payload + signature
export function createToken(inviteCode){
  if (!VALID_INVITE_CODES.includes(inviteCode)) {
    return null;
  }

  const payload = {
    code: inviteCode,
    ts: Date.now(),
    exp: Date.now() + EXP_MS
  };

  const signature = hash(JSON.stringify(payload) + "EMPIREPICKS_SECRET_KEY");

  return btoa(JSON.stringify({ payload, signature }));
}

// Validate stored token
export function validateToken(){
  const raw = localStorage.getItem("EP_TOKEN");
  if (!raw) return false;

  try {
    const { payload, signature } = JSON.parse(atob(raw));

    // expired?
    if (Date.now() > payload.exp) return false;

    // signature mismatch?
    const expected = hash(JSON.stringify(payload) + "EMPIREPICKS_SECRET_KEY");
    if (signature !== expected) return false;

    // invite code no longer valid?
    if (!VALID_INVITE_CODES.includes(payload.code)) return false;

    return true;
  } catch (e){
    return false;
  }
}

// Optional: remove the token
export function logout(){
  localStorage.removeItem("EP_TOKEN");
}
