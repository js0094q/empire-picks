// token.js

// CHANGE THIS to whatever invite code you want
const VALID_CODES = ["EMPIRE2025", "BETA1", "JLACCESS"];

function createToken(code){
  if (!VALID_CODES.includes(code)) return null;

  const payload = {
    code,
    ts: Date.now(),
    exp: Date.now() + 7 * 24 * 3600 * 1000 // 7 days
  };

  return btoa(JSON.stringify(payload));
}

function validateToken(){
  const raw = localStorage.getItem("EP_TOKEN");
  if (!raw) return false;

  try {
    const data = JSON.parse(atob(raw));
    if (Date.now() > data.exp) {
      localStorage.removeItem("EP_TOKEN");
      return false;
    }
    return true;
  } catch {
    return false;
  }
}

export { createToken, validateToken };
