/* Request validation + limits. CORS allow-list is NOT authentication (the signed token is);
   it only restricts which web origins the browser may call us from. */

export const LIMITS = {
  MAX_MESSAGES: 10,            // recent window the browser may send
  MAX_MSG_CHARS: 4000,        // per message
  MAX_TOTAL_CHARS: 16000,     // whole conversation text
  MAX_IMAGE_BYTES: 1_500_000, // ~1.5MB decoded image payload
  IMAGE_TYPES: ["image/jpeg", "image/png", "image/webp"],
  MAX_CONTEXT_BYTES: 8000,    // sanitized tracker context blob
};

export function parseAllowedOrigins(env){
  const raw = (env && env.ALLOWED_ORIGINS) || "";
  return raw.split(",").map(s => s.trim()).filter(Boolean);
}

export function originAllowed(origin, allowed){
  if(!origin) return false;
  return allowed.indexOf(origin) >= 0;
}

// data:[type];base64,xxxx  -> { ok, type, bytes } or { ok:false, error }
export function inspectImage(dataUrl){
  if(typeof dataUrl !== "string") return { ok:false, error:"image_invalid" };
  const m = dataUrl.match(/^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=]+)$/);
  if(!m) return { ok:false, error:"image_invalid" };
  const type = m[1].toLowerCase();
  if(LIMITS.IMAGE_TYPES.indexOf(type) < 0) return { ok:false, error:"image_unsupported_type" };
  const approxBytes = Math.floor(m[2].length * 0.75);
  if(approxBytes > LIMITS.MAX_IMAGE_BYTES) return { ok:false, error:"image_too_large" };
  return { ok:true, type, bytes: approxBytes };
}

export function validateSessionBody(body){
  if(!body || typeof body !== "object") return { ok:false, error:"bad_request" };
  if(typeof body.access_code !== "string" || !body.access_code) return { ok:false, error:"bad_request" };
  if(body.access_code.length > 200) return { ok:false, error:"bad_request" };
  return { ok:true, access_code: body.access_code };
}

// Validates the /chat payload from the browser. Returns normalized data or an error code.
export function validateChatBody(body){
  if(!body || typeof body !== "object") return { ok:false, error:"bad_request" };

  const messages = Array.isArray(body.messages) ? body.messages : null;
  if(!messages || messages.length === 0) return { ok:false, error:"no_messages" };
  if(messages.length > LIMITS.MAX_MESSAGES) return { ok:false, error:"too_many_messages" };

  let total = 0;
  const clean = [];
  for(const m of messages){
    if(!m || (m.role !== "user" && m.role !== "assistant")) return { ok:false, error:"bad_message" };
    const text = typeof m.text === "string" ? m.text : "";
    if(text.length > LIMITS.MAX_MSG_CHARS) return { ok:false, error:"message_too_long" };
    total += text.length;
    clean.push({ role: m.role, text });
  }
  if(total > LIMITS.MAX_TOTAL_CHARS) return { ok:false, error:"conversation_too_long" };
  if(clean[clean.length - 1].role !== "user") return { ok:false, error:"last_not_user" };

  // optional single current image
  let image = null;
  if(body.image != null){
    const info = inspectImage(body.image);
    if(!info.ok) return { ok:false, error: info.error };
    image = body.image;
  }

  // sanitized tracker context (already trimmed client-side; we still bound it)
  let context = {};
  if(body.context != null){
    if(typeof body.context !== "object") return { ok:false, error:"bad_context" };
    const json = JSON.stringify(body.context);
    if(json.length > LIMITS.MAX_CONTEXT_BYTES) return { ok:false, error:"context_too_large" };
    context = body.context;
  }

  return { ok:true, messages: clean, image, context };
}
