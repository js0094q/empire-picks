// ========================================================
// EmpirePicks Beta Token System (Hash-Based, Static Hosting Safe)
// ========================================================

const EXP_MS = 6 * 60 * 60 * 1000; // 6 hours

const VALID_INVITE_CODES = [
  "EMPIRE-BETA-01",
  "NFL-ACCESS",
  "TESTER-JS",
];

function hash(str){
  let h = 0;
  for (let i = 0; i < str.length; i++){
    h = (h << 5) - h + str.charCodeAt(i);
    h |= 0;
  }
  return h.toString();
}

// Create signed token
export function createToken(inviteCode){
  if (!VALID_INVITE_CODES.includes(inviteCode)) return null;

  const payload = {
    code: inviteCode,
    ts: Date.now(),
    exp: Date.now() + EXP_MS
  };

  const signature = hash(JSON.stringify(payload) + "EMPIREPICKS_SECRET");

  return btoa(JSON.stringify({ payload, signature }));
}

// Validate stored token
export function validateToken(){
  const raw = localStorage.getItem("EP_TOKEN");
  if (!raw) return false;

  try {
    const { payload, signature } = JSON.parse(atob(raw));
    if (Date.now() > payload.exp) return false;

    const expected = hash(JSON.stringify(payload) + "EMPIREPICKS_SECRET");
    if (expected !== signature) return false;

    return true;
  } catch {
    return false;
  }
}

export function logout(){
  localStorage.removeItem("EP_TOKEN");
}
