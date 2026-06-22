/* gen-vapid.mjs — generate a VAPID key pair (P-256) with no dependencies.
   Run:  node scripts/gen-vapid.mjs
   Prints the PUBLIC key (set as the VAPID_PUBLIC_KEY worker var) and the PRIVATE key
   (store as the VAPID_PRIVATE_KEY worker SECRET — never commit it).
   Output format matches RFC 8292 raw base64url keys (same as `web-push generate-vapid-keys`). */

function b64url(bytes){
  let bin = ""; for(const b of bytes) bin += String.fromCharCode(b);
  return Buffer.from(bin, "binary").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function fromB64url(s){
  s = s.replace(/-/g, "+").replace(/_/g, "/"); while(s.length % 4) s += "=";
  return new Uint8Array(Buffer.from(s, "base64"));
}

const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
const pub = b64url(new Uint8Array(await crypto.subtle.exportKey("raw", kp.publicKey)));   // 65-byte uncompressed point
const jwk = await crypto.subtle.exportKey("jwk", kp.privateKey);
const priv = b64url(fromB64url(jwk.d));                                                    // 32-byte private scalar

console.log("\nVAPID key pair generated.\n");
console.log("VAPID_PUBLIC_KEY (non-secret worker var):");
console.log("  " + pub + "\n");
console.log("VAPID_PRIVATE_KEY (worker SECRET — never commit):");
console.log("  " + priv + "\n");
console.log("Next:");
console.log("  1) Put the PUBLIC key in wrangler.toml  [vars] VAPID_PUBLIC_KEY");
console.log("  2) echo -n '<PRIVATE KEY>' | npx wrangler secret put VAPID_PRIVATE_KEY");
