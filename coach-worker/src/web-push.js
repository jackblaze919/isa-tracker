/* web-push.js — standards-based VAPID Web Push for Cloudflare Workers (Web Crypto only).
   Implements:
   - VAPID (RFC 8292) ES256 request-signature JWT
   - Message encryption (RFC 8291) with the aes128gcm content-encoding (RFC 8188)
   No Node APIs, no third-party crypto. The encryption is validated against the worked
   example in RFC 8291 §5 (see test/reminders.test.js) so the hand-written KDF/cipher is
   proven correct rather than trusted.

   The browser never sees any of this; the VAPID private key lives only in env.VAPID_PRIVATE_KEY. */

const enc = new TextEncoder();

/* ---------- base64url <-> bytes ---------- */
export function b64urlToBytes(b64){
  b64 = String(b64).replace(/-/g, "+").replace(/_/g, "/");
  while(b64.length % 4) b64 += "=";
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export function bytesToB64url(bytes){
  let bin = "";
  for(let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs){
  let len = 0; for(const a of arrs) len += a.length;
  const out = new Uint8Array(len); let o = 0;
  for(const a of arrs){ out.set(a, o); o += a.length; }
  return out;
}
function u32be(n){ return new Uint8Array([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255]); }

/* ---------- HMAC-SHA256 + HKDF (single-block expand; all outputs <= 32 bytes) ---------- */
async function hmacSha256(keyBytes, dataBytes){
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, dataBytes));
}
async function hkdfExpand(prk, info, len){
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, len);
}

/* ---------- ECDH application-server (ephemeral) key ---------- */
export async function generateAsKeyPair(){
  const kp = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"]);
  const pub = new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)); // 65-byte uncompressed
  return { privateKey: kp.privateKey, publicBytes: pub };
}
// Import a fixed AS key (used by the RFC test vector): raw private d + raw public point.
export async function importAsKeyPair(privB64, pubB64){
  const pub = b64urlToBytes(pubB64), d = b64urlToBytes(privB64);
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: bytesToB64url(d), ext: true };
  const privateKey = await crypto.subtle.importKey("jwk", jwk, { name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  return { privateKey, publicBytes: pub };
}

/* ---------- RFC 8291 §3.4 key derivation (exported so tests can pin it to the RFC vector) ---------- */
export async function deriveContentKeys(uaPublic, authSecret, asPublic, ecdh, salt){
  const prkCombine = await hmacSha256(authSecret, ecdh);
  const keyInfo = concat(enc.encode("WebPush: info"), new Uint8Array([0]), uaPublic, asPublic);
  const ikm = await hkdfExpand(prkCombine, keyInfo, 32);
  const prk = await hmacSha256(salt, ikm);
  const cek = await hkdfExpand(prk, concat(enc.encode("Content-Encoding: aes128gcm"), new Uint8Array([0])), 16);
  const nonce = await hkdfExpand(prk, concat(enc.encode("Content-Encoding: nonce"), new Uint8Array([0])), 12);
  return { cek, nonce };
}

/* ---------- RFC 8291 payload encryption (aes128gcm) ---------- */
// opts.salt / opts.asKeyPair let tests pin the random inputs; production omits them.
export async function encryptContent(plaintext, p256dhB64, authB64, opts){
  opts = opts || {};
  const uaPublic = b64urlToBytes(p256dhB64);            // 65 bytes
  const authSecret = b64urlToBytes(authB64);            // 16 bytes
  const salt = opts.salt ? b64urlToBytes(opts.salt) : crypto.getRandomValues(new Uint8Array(16));
  const as = opts.asKeyPair || await generateAsKeyPair();

  const uaKey = await crypto.subtle.importKey("raw", uaPublic, { name: "ECDH", namedCurve: "P-256" }, false, []);
  const ecdh = new Uint8Array(await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, as.privateKey, 256));
  const { cek, nonce } = await deriveContentKeys(uaPublic, authSecret, as.publicBytes, ecdh, salt);

  // single aes128gcm record: plaintext || 0x02 (last-record delimiter)
  const record = concat(typeof plaintext === "string" ? enc.encode(plaintext) : plaintext, new Uint8Array([2]));
  const aesKey = await crypto.subtle.importKey("raw", cek, { name: "AES-GCM" }, false, ["encrypt"]);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce, tagLength: 128 }, aesKey, record));

  // header = salt(16) || rs(uint32) || idlen(1) || keyid(as public, 65)
  const rs = 4096;
  const header = concat(salt, u32be(rs), new Uint8Array([as.publicBytes.length]), as.publicBytes);
  return concat(header, cipher);
}

/* ---------- VAPID JWT (RFC 8292, ES256) ---------- */
async function importVapidSigningKey(publicB64, privateB64){
  const pub = b64urlToBytes(publicB64), d = b64urlToBytes(privateB64);
  const jwk = { kty: "EC", crv: "P-256", x: bytesToB64url(pub.slice(1, 33)), y: bytesToB64url(pub.slice(33, 65)), d: bytesToB64url(d), ext: true };
  return crypto.subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
}
export async function vapidAuthHeader(env, audience, nowSec){
  const now = typeof nowSec === "number" ? nowSec : Math.floor(Date.now() / 1000);
  const header = bytesToB64url(enc.encode(JSON.stringify({ typ: "JWT", alg: "ES256" })));
  const sub = env.VAPID_SUBJECT || "https://jackblaze919.github.io/isa-tracker/";
  const payload = bytesToB64url(enc.encode(JSON.stringify({ aud: audience, exp: now + 12 * 3600, sub })));
  const signingInput = header + "." + payload;
  const key = await importVapidSigningKey(env.VAPID_PUBLIC_KEY, env.VAPID_PRIVATE_KEY);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)));
  const jwt = signingInput + "." + bytesToB64url(sig);
  return "vapid t=" + jwt + ", k=" + env.VAPID_PUBLIC_KEY;
}

/* ---------- send one notification ---------- */
// subscription = { endpoint, keys:{ p256dh, auth } }. Returns { status }.
export async function sendNotification(subscription, payloadObj, env, fetchImpl, opts){
  const audience = new URL(subscription.endpoint).origin;
  const auth = await vapidAuthHeader(env, audience);
  const body = await encryptContent(JSON.stringify(payloadObj), subscription.keys.p256dh, subscription.keys.auth, opts);
  const res = await (fetchImpl || fetch)(subscription.endpoint, {
    method: "POST",
    headers: {
      "Authorization": auth,
      "Content-Encoding": "aes128gcm",
      "Content-Type": "application/octet-stream",
      "TTL": String((opts && opts.ttl) || 1800),
      "Urgency": "normal"
    },
    body
  });
  return { status: res.status };
}
