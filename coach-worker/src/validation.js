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

/* ===================== Hammy reminders validation ===================== */

export const REMINDER_CATEGORIES = ["steps", "workout", "protein", "meals", "checkin"];
const REMINDER_LIMITS = { MAX_ENDPOINT: 1024, MAX_KEY: 256, MAX_COUNT: 50, MAX_STEPS: 200000 };

export function isValidTime(t){ return typeof t === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(t); }

export function isValidTimezone(tz){
  if(typeof tz !== "string" || !tz || tz.length > 64) return false;
  try{ new Intl.DateTimeFormat("en-US", { timeZone: tz }); return true; }catch(e){ return false; }
}

export function isValidLocalDate(d){
  if(typeof d !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return false;
  const [y, m, day] = d.split("-").map(Number);
  if(m < 1 || m > 12 || day < 1 || day > 31) return false;
  const dt = new Date(Date.UTC(y, m - 1, day));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === day;
}

function looksLikeKey(s, max){ return typeof s === "string" && s.length > 0 && s.length <= max && /^[A-Za-z0-9_\-=]+$/.test(s); }

// PushSubscription JSON: { endpoint, expirationTime, keys:{ p256dh, auth } }
export function validateSubscriptionBody(body){
  const sub = body && typeof body === "object" ? body.subscription : null;
  if(!sub || typeof sub !== "object") return { ok:false, error:"bad_subscription" };
  if(typeof sub.endpoint !== "string" || !/^https:\/\//.test(sub.endpoint) || sub.endpoint.length > REMINDER_LIMITS.MAX_ENDPOINT)
    return { ok:false, error:"bad_endpoint" };
  const keys = sub.keys;
  if(!keys || typeof keys !== "object") return { ok:false, error:"bad_keys" };
  if(!looksLikeKey(keys.p256dh, REMINDER_LIMITS.MAX_KEY) || !looksLikeKey(keys.auth, REMINDER_LIMITS.MAX_KEY))
    return { ok:false, error:"bad_keys" };
  let exp = null;
  if(sub.expirationTime != null){
    if(typeof sub.expirationTime !== "number" || !isFinite(sub.expirationTime)) return { ok:false, error:"bad_expiration" };
    exp = Math.floor(sub.expirationTime);
  }
  return { ok:true, subscription: { endpoint: sub.endpoint, p256dh: keys.p256dh, auth: keys.auth, expiration_time: exp } };
}

export function validatePreferencesBody(body){
  if(!body || typeof body !== "object") return { ok:false, error:"bad_request" };
  if(!isValidTimezone(body.timezone)) return { ok:false, error:"bad_timezone" };
  if(!isValidTime(body.quiet_start) || !isValidTime(body.quiet_end)) return { ok:false, error:"bad_time" };
  const cats = body.categories;
  if(!cats || typeof cats !== "object") return { ok:false, error:"bad_categories" };
  const out = {};
  for(const k of Object.keys(cats)){
    if(REMINDER_CATEGORIES.indexOf(k) < 0) return { ok:false, error:"bad_category" };
    const c = cats[k];
    if(!c || typeof c !== "object" || typeof c.enabled !== "boolean" || !isValidTime(c.time))
      return { ok:false, error:"bad_category" };
    out[k] = { enabled: c.enabled, time: c.time };
  }
  const enabled = typeof body.enabled === "boolean" ? body.enabled : true;
  return { ok:true, preferences: { timezone: body.timezone, quiet_start: body.quiet_start, quiet_end: body.quiet_end, categories: out, enabled } };
}

function num(v, max){ return typeof v === "number" && isFinite(v) && v >= 0 && v <= max ? Math.floor(v) : null; }

// Strict status schema: ONLY the allowed completion flags. Any extra/unknown/private field is rejected.
export function validateStatusBody(body){
  if(!body || typeof body !== "object") return { ok:false, error:"bad_request" };
  const allowedTop = ["local_date", "timezone", "steps", "workout", "protein", "meals", "checkin"];
  for(const k of Object.keys(body)) if(allowedTop.indexOf(k) < 0) return { ok:false, error:"unexpected_field:" + k };
  if(!isValidLocalDate(body.local_date)) return { ok:false, error:"bad_local_date" };
  if(!isValidTimezone(body.timezone)) return { ok:false, error:"bad_timezone" };

  const shape = {
    steps:   { logged:"bool", complete:"bool", actual:"count_big", target:"count_big" },
    workout: { required:"bool", logged:"bool", complete:"bool" },
    protein: { logged:"bool", complete:"bool" },
    meals:   { logged_count:"count", total:"count", complete:"bool" },
    checkin: { required:"bool", complete:"bool" }
  };
  const status = {};
  for(const cat of REMINDER_CATEGORIES){
    const src = body[cat];
    if(!src || typeof src !== "object") return { ok:false, error:"bad_status:" + cat };
    const fields = shape[cat]; const dst = {};
    for(const f of Object.keys(src)) if(!(f in fields)) return { ok:false, error:"unexpected_field:" + cat + "." + f };
    for(const f of Object.keys(fields)){
      const t = fields[f], v = src[f];
      if(t === "bool"){ if(typeof v !== "boolean") return { ok:false, error:"bad_status:" + cat + "." + f }; dst[f] = v; }
      else { const n = num(v, t === "count_big" ? REMINDER_LIMITS.MAX_STEPS : REMINDER_LIMITS.MAX_COUNT); if(n === null) return { ok:false, error:"bad_status:" + cat + "." + f }; dst[f] = n; }
    }
    status[cat] = dst;
  }
  return { ok:true, local_date: body.local_date, timezone: body.timezone, status };
}

export function validatePauseBody(body){
  if(!body || typeof body !== "object") return { ok:false, error:"bad_request" };
  if(!isValidLocalDate(body.local_date)) return { ok:false, error:"bad_local_date" };
  return { ok:true, local_date: body.local_date };
}
