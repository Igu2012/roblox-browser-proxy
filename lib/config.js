"use strict";
module.exports = {
  PORT: Number(process.env.PORT) || 3000,
  HOST: process.env.HOST || "0.0.0.0",
  BASE: process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL || ("http://localhost:" + (Number(process.env.PORT) || 3000)),
  TARGET_ORIGIN: process.env.TARGET_ORIGIN || "https://www.roblox.com",
  PLAY_ORIGIN: process.env.PLAY_ORIGIN || "https://play.roblox.com",
  PROXY_ASSET_VERSION: process.env.PROXY_ASSET_VERSION || "5",
  PROXY_PREFIX: "/x/",
  STRIP_REQUEST_HEADERS: [
    "host","connection","content-length","accept-encoding",
    "transfer-encoding","upgrade","proxy-connection","proxy-authorization",
  ],
  STRIP_RESPONSE_HEADERS: [
    "content-security-policy","content-security-policy-report-only",
    "x-frame-options","x-content-type-options","content-encoding",
    "transfer-encoding","content-length","strict-transport-security",
    "public-key-pins","public-key-pins-report-only","expect-ct",
    "cross-origin-opener-policy","cross-origin-embedder-policy",
    "cross-origin-resource-policy","permissions-policy",
  ],
};
