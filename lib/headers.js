"use strict";
const { TARGET_ORIGIN, PROXY_PREFIX, STRIP_REQUEST_HEADERS, STRIP_RESPONSE_HEADERS } = require("./config");

function rewriteRequestHeaders(headers, targetOrigin) {
  const out = { ...headers };
  for (const h of STRIP_REQUEST_HEADERS) delete out[h];
  try { out.host = new URL(targetOrigin).host; } catch {}
  out["accept-encoding"] = "identity";
  if (out.origin && /localhost|127\.0\.0\.1|onrender\.com/.test(out.origin)) out.origin = targetOrigin;
  if (out.referer && /localhost|127\.0\.0\.1|onrender\.com/.test(out.referer)) {
    try {
      const u = new URL(out.referer);
      const m = u.pathname.match(/^\/x\/(https?:\/\/[^/]+)(.*)$/);
      if (m) out.referer = m[1] + m[2] + u.search;
    } catch {}
  }
  if (out["sec-fetch-site"] === "cross-site") out["sec-fetch-site"] = "same-origin";
  return out;
}

function rewriteResponseHeaders(headers, targetUrl) {
  const out = { ...headers };
  for (const h of STRIP_RESPONSE_HEADERS) delete out[h];
  if (out.location) out.location = rewriteLocation(out.location, targetUrl);
  if (out["set-cookie"]) out["set-cookie"] = out["set-cookie"].map(rewriteSetCookie);
  out["access-control-allow-origin"] = "*";
  out["access-control-allow-credentials"] = "true";
  out["access-control-allow-headers"] = "*";
  out["access-control-allow-methods"] = "GET, POST, PUT, PATCH, DELETE, OPTIONS, HEAD";
  return out;
}

function rewriteLocation(loc, baseUrl) {
  try {
    const resolved = new URL(loc, baseUrl);
    if (resolved.origin === TARGET_ORIGIN) return resolved.pathname + resolved.search + resolved.hash || "/";
    return PROXY_PREFIX + resolved.href;
  } catch { return loc; }
}

function rewriteSetCookie(cookie) {
  let out = cookie;
  out = out.replace(/;\s*Domain=[^;]*/gi, "");
  out = out.replace(/;\s*Secure/gi, "");
  out = out.replace(/;\s*Partitioned/gi, "");
  out = out.replace(/;\s*SameSite=[^;]*/gi, "; SameSite=Lax");
  if (!/;\s*SameSite=/i.test(out)) out += "; SameSite=Lax";
  if (!/;\s*Path=/i.test(out)) out += "; Path=/";
  return out;
}

module.exports = { rewriteRequestHeaders, rewriteResponseHeaders };
