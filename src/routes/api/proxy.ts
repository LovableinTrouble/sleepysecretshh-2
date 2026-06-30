import { createFileRoute } from "@tanstack/react-router";

// Hosts we are willing to proxy through. Keep this tight — this endpoint
// effectively turns our server into an HTML rewriter; only allow embed
// providers we already trust.
const ALLOWED_HOSTS = new Set<string>([
  "zxcstream.xyz",
  "v.zxcstream.xyz",
  "vidsrc.cc",
  "vidsrc.to",
  "vidsrc.xyz",
]);

function hostAllowed(h: string) {
  if (ALLOWED_HOSTS.has(h)) return true;
  for (const allowed of ALLOWED_HOSTS) if (h.endsWith("." + allowed)) return true;
  return false;
}

// Script injected into proxied HTML. Neutralises window.open, popunders
// disguised as <a target="_blank">, and noopener redirects.
const ANTI_POPUP = `(()=>{try{
const noop=()=>null;
try{Object.defineProperty(window,'open',{value:noop,writable:false,configurable:false});}catch(_){window.open=noop;}
try{Object.defineProperty(window,'opener',{value:null,writable:false,configurable:false});}catch(_){}
const origCreate=document.createElement.bind(document);
document.createElement=function(tag){
  const el=origCreate(tag);
  if(String(tag).toLowerCase()==='a'){try{Object.defineProperty(el,'target',{configurable:true,get(){return '_self';},set(){}});}catch(_){}}
  return el;
};
const stripTarget=(root)=>{try{root.querySelectorAll&&root.querySelectorAll('a[target]').forEach(a=>a.removeAttribute('target'));}catch(_){}};
document.addEventListener('DOMContentLoaded',()=>stripTarget(document));
new MutationObserver(muts=>muts.forEach(m=>m.addedNodes.forEach(n=>stripTarget(n)))).observe(document.documentElement,{childList:true,subtree:true});
document.addEventListener('click',e=>{const a=e.target&&e.target.closest&&e.target.closest('a');if(a&&(a.target==='_blank'||/^https?:/.test(a.href||'')&&a.host&&a.host!==location.host)){const href=a.href||'';if(/popunder|ads?\\.|track|click|redirect/i.test(href)){e.preventDefault();e.stopImmediatePropagation();}}},true);
}catch(_){}})();`;

export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("url");
        if (!raw) return new Response("missing url", { status: 400 });
        let target: URL;
        try {
          target = new URL(raw);
        } catch {
          return new Response("bad url", { status: 400 });
        }
        if (!/^https?:$/.test(target.protocol) || !hostAllowed(target.hostname)) {
          return new Response("host not allowed", { status: 403 });
        }
        try {
          const upstream = await fetch(target.toString(), {
            headers: {
              "user-agent":
                request.headers.get("user-agent") ||
                "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
              accept: request.headers.get("accept") || "text/html,*/*",
              "accept-language": request.headers.get("accept-language") || "en-US,en;q=0.9",
              referer: target.origin + "/",
            },
            redirect: "follow",
          });
          const ct = upstream.headers.get("content-type") || "";
          // Only rewrite HTML responses. Everything else (JS, CSS, media,
          // JSON) is streamed through untouched.
          if (!ct.toLowerCase().includes("text/html")) {
            const headers = new Headers();
            if (ct) headers.set("content-type", ct);
            headers.set("cache-control", "no-store");
            return new Response(upstream.body, { status: upstream.status, headers });
          }
          let html = await upstream.text();
          const baseHref = target.origin + target.pathname.replace(/[^/]*$/, "");
          const inject = `<base href="${baseHref}"><meta name="referrer" content="no-referrer"><script>${ANTI_POPUP}</script>`;
          if (/<head[^>]*>/i.test(html)) {
            html = html.replace(/<head([^>]*)>/i, (_m, attrs) => `<head${attrs}>${inject}`);
          } else if (/<html[^>]*>/i.test(html)) {
            html = html.replace(/<html([^>]*)>/i, (_m, attrs) => `<html${attrs}><head>${inject}</head>`);
          } else {
            html = inject + html;
          }
          return new Response(html, {
            status: 200,
            headers: {
              "content-type": "text/html; charset=utf-8",
              "cache-control": "no-store",
              // Deliberately omit X-Frame-Options / CSP so our own iframe
              // can render this response.
            },
          });
        } catch {
          return new Response("proxy error", { status: 502 });
        }
      },
    },
  },
});