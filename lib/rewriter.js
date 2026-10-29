"use strict";
const cheerio = require("cheerio");
const { BASE, PROXY_PREFIX, TARGET_ORIGIN, PLAY_ORIGIN, PROXY_ASSET_VERSION } = require("./config");

const PASS_THROUGH_PREFIXES = ["#","javascript:","mailto:","tel:","data:","blob:","about:"];

function toProxy(u, origin) {
  if (typeof u !== "string" || u.length === 0) return u;
  for (const p of PASS_THROUGH_PREFIXES) if (u.startsWith(p)) return u;
  if (u.startsWith(PROXY_PREFIX)) return u;
  if (u.startsWith(BASE)) return u.slice(BASE.length);
  try {
    const resolved = new URL(u, origin);
    if (resolved.origin === TARGET_ORIGIN) return resolved.pathname + resolved.search + resolved.hash || "/";
    if (resolved.origin === PLAY_ORIGIN && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/start(?:\/|$)/i.test(resolved.pathname)) {
      return resolved.pathname + resolved.search + resolved.hash || "/";
    }
    return PROXY_PREFIX + resolved.href;
  } catch { return u; }
}

function getShim(origin) {
  const cfg = { BASE, PROXY_PREFIX, ORIGIN: origin, MAIN: TARGET_ORIGIN, PLAY: PLAY_ORIGIN };
  return `(function(){
  var BASE=${JSON.stringify(cfg.BASE)},PREFIX=${JSON.stringify(cfg.PROXY_PREFIX)},ORIGIN=${JSON.stringify(cfg.ORIGIN)},MAIN=${JSON.stringify(cfg.MAIN)},PLAY=${JSON.stringify(cfg.PLAY)};
  var PASS=${JSON.stringify(PASS_THROUGH_PREFIXES)};
  function toProxy(u){if(u==null||typeof u!=="string")return u;
    for(var i=0;i<PASS.length;i++)if(u.indexOf(PASS[i])===0)return u;
    if(u.indexOf(PREFIX)===0)return u; if(u.indexOf(BASE)===0)return u.slice(BASE.length);
    try{var r=new URL(u,ORIGIN);if(r.origin===MAIN|| (r.origin===PLAY && /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?games\/start(?:\/|$)/i.test(r.pathname)))return r.pathname+r.search+r.hash||"/";return PREFIX+r.href}catch(e){return u}}
  window.__PROXY_ORIGIN=ORIGIN;window.__PROXY_TO=toProxy;
  var _f=window.fetch;if(_f)window.fetch=function(i,o){
    if(typeof i==="string")i=toProxy(i);
    else if(i&&typeof i==="object"&&i.url){var n=toProxy(i.url);if(n!==i.url)i=new Request(n,i)}
    return _f.call(this,i,o)};
  var _o=XMLHttpRequest.prototype.open;XMLHttpRequest.prototype.open=function(m,u){
    var a=Array.prototype.slice.call(arguments);if(typeof u==="string")a[1]=toProxy(u);
    return _o.apply(this,a)};
  var _W=window.WebSocket;if(_W){var P=function(u,p){return new _W(BASE.replace(/^http/,"ws")+toProxy(u),p)};
    P.prototype=_W.prototype;P.CONNECTING=_W.CONNECTING;P.OPEN=_W.OPEN;P.CLOSING=_W.CLOSING;P.CLOSED=_W.CLOSED;window.WebSocket=P}
  if(window.EventSource){var _E=window.EventSource;window.EventSource=function(u,o){return new _E(toProxy(u),o)};window.EventSource.prototype=_E.prototype}
  if(navigator.sendBeacon){var _s=navigator.sendBeacon.bind(navigator);navigator.sendBeacon=function(u,d){return _s(toProxy(u),d)}}
  if(window.Worker){var _k=window.Worker;window.Worker=function(u,o){return new _k(toProxy(u),o)};window.Worker.prototype=_k.prototype}
  document.addEventListener("click",function(e){
    var el=e.target&&e.target.closest&&e.target.closest("button,a,[role='button']");
    if(!el)return;
    var label=((el.innerText||el.getAttribute("aria-label")||el.getAttribute("data-testid")||"")+" "+(el.className||"")).toLowerCase();
    var parent=el.closest("a[href]");
    var source=(parent&&parent.getAttribute("href"))||"";
    var m=location.pathname.match(/\/games\/(\d+)(?:\/|$)/i)||source.match(/\/games\/(\d+)(?:\/|$)/i)||source.match(/[?&]placeId=(\d+)/i);
    if(m&&/\b(play|jogar|join)\b/.test(label)&&!el.disabled){
      e.preventDefault();e.stopImmediatePropagation();location.href="/games/start?placeId="+encodeURIComponent(m[1]);return;
    }
    var h=el.getAttribute("href");if(!h)return;var p=toProxy(h);if(p!==h)el.setAttribute("href",p)
  },true);
  try{var d=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,"src");
    if(d&&d.set)Object.defineProperty(HTMLImageElement.prototype,"src",{get:d.get,set:function(v){d.set.call(this,toProxy(v))},configurable:true})}catch(e){}
  var _a=Element.prototype.appendChild;Element.prototype.appendChild=function(n){
    if(n&&n.tagName){if(n.tagName==="SCRIPT"&&n.src)n.src=toProxy(n.src);
      else if(n.tagName==="LINK"&&n.href)n.href=toProxy(n.href);
      else if(n.tagName==="IFRAME"&&n.src)n.src=toProxy(n.src)}
    return _a.call(this,n)};
})();`;
}

function rewriteCss(css, origin) {
  if (!css || typeof css !== "string") return css;
  css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g, (m,q,u) => `url(${q}${toProxy(u,origin)}${q})`);
  css = css.replace(/@import\s+(['"])([^'"]+)\1/g, (m,q,u) => `@import ${q}${toProxy(u,origin)}${q}`);
  return css;
}

function rewriteJs(js, origin) {
  if (!js || typeof js !== "string") return js;
  return js.replace(/(["'])(https?:\/\/[^"'\s]+)\1/g, (m,q,url) => {
    // Roblox builds several complete endpoints from prefixes such as
    // "https://apis.". Rewriting those fragments breaks the concatenation.
    if (url.endsWith(".")) return m;
    return q + toProxy(url, origin) + q;
  });
}

function rewriteHtml(html, origin, baseUrl) {
  const $ = cheerio.load(html, { decodeEntities: false });
  $('meta[http-equiv]').each((_,el)=>{const hv=($(el).attr("http-equiv")||"").toLowerCase();
    if(hv.includes("content-security-policy"))$(el).remove()});
  $("head").prepend(`<script>${getShim(origin)}</script>`);
  const baseHref = "/";
  if ($("base[href]").length) $("base[href]").attr("href", baseHref);
  else $("head").prepend(`<base href="${baseHref}">`);
  const urlAttrs = ["href","src","action","poster","formaction","data-src","data-href","data-url","data-bg"];
  for (const a of urlAttrs) $(`[${a}]`).each((_,el)=>{const v=$(el).attr(a);
    if(typeof v!=="string")return;const r=toProxy(v,origin);if(r!==v)$(el).attr(a,r)});
  $("script[src^='/x/']").each((_,el)=>{const src=$(el).attr("src")||"";
    $(el).attr("src", src + (src.includes("?") ? "&" : "?") + "__proxy_v=" + encodeURIComponent(PROXY_ASSET_VERSION));
  });
  $("[srcset]").each((_,el)=>{const v=$(el).attr("srcset")||"";
    $(el).attr("srcset",v.split(",").map(s=>{const t=s.trim().split(/\s+/);
      if(!t.length)return s;t[0]=toProxy(t[0],origin);return t.filter(Boolean).join(" ")}).join(", "))});
  $("style").each((_,el)=>{const v=$(el).html();if(v)$(el).html(rewriteCss(v,origin))});
  $("[style]").each((_,el)=>{const v=$(el).attr("style");if(v)$(el).attr("style",rewriteCss(v,origin))});
  return $.html();
}

module.exports = { rewriteHtml, rewriteCss, rewriteJs, toProxy };
