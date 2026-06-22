/* email-provider-resend.js — send one email via Resend over plain HTTPS fetch (no SDK).
   Returns a normalized result; never throws raw provider internals to the caller.
   The API key lives only in env.RESEND_API_KEY (a Worker secret) and is never returned/logged. */

const RESEND_URL = "https://api.resend.com/emails";

// { to, subject, text } -> { ok, status, id, error }
export async function sendEmail(env, msg, fetchImpl){
  if(!env || !env.RESEND_API_KEY) return { ok: false, status: 0, id: null, error: "missing_resend_api_key" };
  if(!env.DIGEST_TO_EMAIL && !(msg && msg.to)) return { ok: false, status: 0, id: null, error: "missing_to_email" };
  if(!env.DIGEST_FROM_EMAIL) return { ok: false, status: 0, id: null, error: "missing_from_email" };

  const body = {
    from: env.DIGEST_FROM_EMAIL,
    to: [msg.to || env.DIGEST_TO_EMAIL],
    subject: msg.subject,
    text: msg.text
  };
  let res;
  try{
    res = await (fetchImpl || fetch)(RESEND_URL, {
      method: "POST",
      headers: { "Authorization": "Bearer " + env.RESEND_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(body)
    });
  }catch(e){ return { ok: false, status: 0, id: null, error: "network_error" }; }

  let data = {};
  try{ data = await res.json(); }catch(e){}
  if(res.ok) return { ok: true, status: res.status, id: (data && data.id) || null, error: null };
  // surface only a short, non-sensitive error code
  return { ok: false, status: res.status, id: null, error: "provider_http_" + res.status };
}

// Build the Resend request body (exported so tests can assert the shape without sending).
export function buildResendRequest(env, msg){
  return { from: env.DIGEST_FROM_EMAIL, to: [msg.to || env.DIGEST_TO_EMAIL], subject: msg.subject, text: msg.text };
}
