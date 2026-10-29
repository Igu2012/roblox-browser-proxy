"use strict";
const http = require("http");
const zlib = require("zlib");
const { URL } = require("url");
const httpProxy = require("http-proxy");

const { PORT, HOST, BASE, TARGET_ORIGIN, PLAY_ORIGIN, PROXY_PREFIX } = require("./lib/config");
const { rewriteRequestHeaders, rewriteResponseHeaders } = require("./lib/headers");
const { rewriteHtml, rewriteCss } = require("./lib/rewriter");

const proxy = httpProxy.createProxyServer({ selfHandleResponse: true, changeOrigin: true, ws: true, xfwd: false });

function parseTarget(raw) {
  const localizedLegacy = raw.match(/^\/(?:[a-z]{2}(?:-[a-z]{2})?)\/x\/(https?:\/\/.*)$/i);
  if (localizedLegacy) raw = PROXY_PREFIX + localizedLegacy[1];
  if (raw.startsWith(PROXY_PREFIX)) {
    const target = new URL(raw.slice(PROXY_PREFIX.length));
    if (target.origin === BASE || /(^|\.)roblox-browser-proxy\.onrender\.com$/i.test(target.hostname)) {
      return new URL(target.pathname + target.search, TARGET_ORIGIN);
    }
    return target;
  }
  const pathname = (raw || "/").split("?")[0];
  if (/^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/start(?:\/|$)/i.test(pathname)) {
    return new URL(raw || "/", PLAY_ORIGIN);
  }
  return new URL(raw || "/", TARGET_ORIGIN);
}

function applyForge(proxyReq, req) {
  const forged = rewriteRequestHeaders(req.headers, req.__targetOrigin || "");
  for (const k of Object.keys(proxyReq.getHeaders())) if (!(k in forged)) proxyReq.removeHeader(k);
  for (const [k, v] of Object.entries(forged)) if (v != null) proxyReq.setHeader(k, v);
}
proxy.on("proxyReq", applyForge);
proxy.on("proxyReqWs", applyForge);

function decodeBody(body, encoding) {
  const enc = (encoding || "").toLowerCase().trim();
  if (enc === "gzip") return zlib.gunzipSync(body);
  if (enc === "deflate") return zlib.inflateSync(body);
  if (enc === "br") return zlib.brotliDecompressSync(body);
  return body;
}

proxy.on("proxyRes", (proxyRes, req, res) => {
  const targetUrl = req.__targetHref || "";
  const origin = req.__targetOrigin || "";
  const ct = (proxyRes.headers["content-type"] || "").toLowerCase();
  const chunks = [];
  proxyRes.on("data", c => chunks.push(c));
  proxyRes.on("error", () => {
    if (!res.headersSent) { res.writeHead(502, {"content-type":"text/plain"}); res.end("upstream stream error"); }
  });
  proxyRes.on("end", () => {
    if (res.headersSent) return;
    let body = Buffer.concat(chunks);
    if (proxyRes.headers["content-encoding"]) {
      try { body = decodeBody(body, proxyRes.headers["content-encoding"]); } catch {}
    }
    let outBody = body;
    try {
      if (ct.includes("text/html")) outBody = Buffer.from(rewriteHtml(body.toString("utf8"), origin, targetUrl), "utf8");
      else if (ct.includes("text/css")) outBody = Buffer.from(rewriteCss(body.toString("utf8"), origin), "utf8");
    } catch (e) { console.error("rewrite failed:", e.message); outBody = body; }
    const headers = rewriteResponseHeaders(proxyRes.headers, targetUrl);
    headers["content-length"] = Buffer.byteLength(outBody);
    res.writeHead(proxyRes.statusCode, headers);
    res.end(outBody);
  });
});

proxy.on("error", (err, req, res) => {
  if (res && typeof res.writeHead === "function" && !res.headersSent) {
    res.writeHead(502, {"content-type":"text/plain"}); res.end("proxy error: " + err.message);
  }
});

const server = http.createServer((req, res) => {
  if (req.url === "/index.html") req.url = "/";
  if (req.url.startsWith("/")) {
    let target;
    try { target = parseTarget(req.url); } catch {
      res.writeHead(400, {"content-type":"text/plain"}); res.end("bad target: " + req.url); return;
    }
    req.__targetHref = target.href;
    req.__targetOrigin = target.origin;
    const orig = req.url;
    req.url = target.pathname + target.search;
    proxy.web(req, res, { target: target.origin, changeOrigin: true, prependPath: false }, (err) => {
      req.url = orig;
      if (!res.headersSent) { res.writeHead(502, {"content-type":"text/plain"}); res.end("proxy failed: " + err.message); }
    });
    return;
  }
  res.writeHead(404, {"content-type":"text/plain"}); res.end("not found: " + req.url);
});

server.on("upgrade", (req, socket, head) => {
  if (!req.url || !req.url.startsWith(PROXY_PREFIX)) { socket.destroy(); return; }
  let target;
  try { target = parseTarget(req.url); } catch { socket.destroy(); return; }
  const httpOrigin = target.origin.replace(/^wss:/, "https:").replace(/^ws:/, "http:");
  req.__targetHref = target.href;
  req.__targetOrigin = httpOrigin;
  req.url = target.pathname + target.search;
  proxy.ws(req, socket, head, { target: httpOrigin, changeOrigin: true, ws: true, prependPath: false });
});

server.listen(PORT, HOST, () => {
  console.log("roblox-browser proxy");
  console.log("  listening: http://" + HOST + ":" + PORT);
  console.log("  open:      http://localhost:" + PORT + "/");
});
