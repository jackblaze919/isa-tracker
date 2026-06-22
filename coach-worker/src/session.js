/* Signed session tokens (HMAC-SHA256). No DB, no accounts.
   token = base64url(JSON payload) + "." + base64url(HMAC(secret, payloadPart))
   payload = { v:1, iat, exp, sid }  — sid is a random opaque id, never the access code. */

const enc = new TextEncoder();

function b64urlEncode(bytes){
  let bin = "";
  for(let i=0;i<bytes.length;i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"");
}
function b64urlEncodeStr(str){ return b64urlEncode(enc.encode(str)); }
function b64urlDecodeToStr(b64){
  b64 = b64.replace(/-/g,"+").replace(/_/g,"/");
  while(b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for(let i=0;i<bin.length;i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

async function hmac(secret, data){
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name:"HMAC", hash:"SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return b64urlEncode(new Uint8Array(sig));
}

// constant-time string compare
function timingSafeEqual(a, b){
  if(typeof a !== "string" || typeof b !== "string" || a.length !== b.length) return false;
  let out = 0;
  for(let i=0;i<a.length;i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

function randomId(){
  const b = new Uint8Array(16); crypto.getRandomValues(b); return b64urlEncode(b);
}

const DAY = 86400 * 1000;

export async function createSession(secret, ttlMs = 30 * DAY){
  const now = Date.now();
  const payload = { v:1, iat: now, exp: now + ttlMs, sid: randomId() };
  const payloadPart = b64urlEncodeStr(JSON.stringify(payload));
  const sig = await hmac(secret, payloadPart);
  return { token: payloadPart + "." + sig, payload };
}

// Returns the payload on success, or null on any failure (missing/invalid/modified/expired).
export async function verifySession(token, secret){
  try{
    if(typeof token !== "string" || !secret) return null;
    const dot = token.indexOf(".");
    if(dot <= 0) return null;
    const payloadPart = token.slice(0, dot);
    const sig = token.slice(dot + 1);
    if(!payloadPart || !sig) return null;
    const expected = await hmac(secret, payloadPart);
    if(!timingSafeEqual(sig, expected)) return null;     // modified/forged
    const payload = JSON.parse(b64urlDecodeToStr(payloadPart));
    if(!payload || payload.v !== 1) return null;
    if(typeof payload.exp !== "number" || Date.now() >= payload.exp) return null;  // expired
    return payload;
  }catch(e){ return null; }
}

export { randomId };
