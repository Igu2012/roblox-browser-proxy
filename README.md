# roblox-browser-proxy

Reverse-proxy harness serving roblox.com through one origin. Local or Render.

## Run locallyOpen `http://localhost:3000/`.

## Deploy on Render
Push to a repo with `render.yaml` at root → New Blueprint → point at repo.
Render injects `PORT`; `HOST` defaults to `0.0.0.0`.

## Scheme
`/<base>/x/<absolute-url>`
e.g. `/x/https://www.roblox.com/home`
     `/x/https://assetdelivery.roblox.com/v1/asset/123`
     `/x/wss://game.roblox.com/notifications`

## Rewrites
HTML attrs/srcset/inline-style/base + shim; CSS url()/@import; JS static URLs;
headers Location/Set-Cookie/Origin/Referer, CSP+HSTS+XFO stripped;
WebSocket `/x/wss://...` with changeOrigin.

## Limits
1. 3D client is native; `play.roblox.com/games/start?placeId=` → `roblox://`.
   Website works, 3D engine out of scope.
2. localStorage/IndexedDB live in the proxy origin keyspace. Cookies fine.
3. Servers ignoring `accept-encoding: identity` are decompressed.
4. CSRF X-CSRF-TOKEN flow passes through with forged Origin.
5. Frontend JS patches often; fix is one line in getShim().
6. Render free plan sleeps after 15m idle → live WS drop. Starter keeps warm.
