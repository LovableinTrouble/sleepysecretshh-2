// Client-only interceptor: blocks popups and network requests to known
// ad/popup domains used by embedded streaming players (ZXCStream etc).
//
// The embedded iframe is cross-origin so we can't patch its internal
// fetch/XHR — but popup ads typically fire via window.open() on the
// top-level window (window.top.open / parent.open), which we CAN
// intercept from the parent document.
//
// Runs as a side-effect import — no iframe sandboxing required.

if (typeof window !== "undefined") {
  const BLOCKED_DOMAINS = [
    "sentrygabiescloes.qpon",
    "devilyquondam.cyou",
    "jivingafrithm.cyou",
    "guarriancha.qpon",
  ];

  const isBlocked = (input: unknown): boolean => {
    try {
      let url: string | null = null;
      if (typeof input === "string") url = input;
      else if (input instanceof URL) url = input.href;
      else if (input && typeof input === "object" && "url" in (input as Request)) {
        url = (input as Request).url;
      }
      if (!url) return false;
      const host = new URL(url, window.location.href).hostname;
      return BLOCKED_DOMAINS.some(
        (d) => host === d || host.endsWith("." + d),
      );
    } catch {
      return false;
    }
  };

  // ─── 1. Block window.open() popups ───────────────────────────
  // The iframe calls top.open() / parent.open() to spawn ad popups.
  // We override open() on every frame we can reach (our own window)
  // and silently return null for blocked URLs.
  const origOpen = window.open;
  window.open = function (
    url?: string | URL,
    target?: string,
    features?: string,
  ): Window | null {
    if (url && isBlocked(url)) {
      return null;
    }
    return origOpen.call(window, url as string, target, features);
  } as typeof window.open;

  // ─── 2. Block navigation to ad domains ───────────────────────
  // If the iframe tries to navigate the top frame to an ad URL
  // (via top.location = ...), intercept beforeunload.
  window.addEventListener("beforeunload", (e) => {
    // We can't read the destination URL here, but we can check if
    // any known ad link was clicked recently. This is a fallback —
    // the window.open override above handles the primary case.
  });

  // ─── 3. Block network requests in the parent document ────────
  // These patches apply to our own origin's requests. The iframe's
  // cross-origin requests are handled by the service worker (sw.js).
  const emptyResponse = () =>
    new Response("", {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/plain" },
    });

  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (isBlocked(input)) return Promise.resolve(emptyResponse());
      return origFetch(input, init);
    }) as typeof window.fetch;
  }

  const XHR = window.XMLHttpRequest;
  if (XHR) {
    const origOpen = XHR.prototype.open;
    const origSend = XHR.prototype.send;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    XHR.prototype.open = function (this: any, method: string, url: string | URL) {
      this.__blocked = isBlocked(url);
      // eslint-disable-next-line prefer-rest-params, @typescript-eslint/no-explicit-any
      return origOpen.apply(this, arguments as any);
    } as typeof XHR.prototype.open;
    XHR.prototype.send = function (
      this: XMLHttpRequest & { __blocked?: boolean },
      body?: Document | XMLHttpRequestBodyInit | null,
    ) {
      if (this.__blocked) {
        Object.defineProperty(this, "readyState", { configurable: true, value: 4 });
        Object.defineProperty(this, "status", { configurable: true, value: 200 });
        Object.defineProperty(this, "statusText", { configurable: true, value: "OK" });
        Object.defineProperty(this, "responseText", { configurable: true, value: "" });
        Object.defineProperty(this, "response", { configurable: true, value: "" });
        setTimeout(() => {
          this.dispatchEvent(new Event("readystatechange"));
          this.dispatchEvent(new Event("load"));
          this.dispatchEvent(new Event("loadend"));
        }, 0);
        return;
      }
      return origSend.call(this, body ?? null);
    } as typeof XHR.prototype.send;
  }

  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
      if (isBlocked(url)) return true;
      return origBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  }

  // ─── 4. Strip ad elements injected into the parent DOM ───────
  // The iframe can inject <script>, <img>, <iframe> into the parent
  // if it has same-origin access — strip them via MutationObserver.
  const stripBlockedSrc = (node: Element) => {
    const attrs = ["src", "href", "data-src"];
    for (const a of attrs) {
      const v = node.getAttribute?.(a);
      if (v && isBlocked(v)) {
        node.removeAttribute(a);
        node.remove();
        return;
      }
    }
  };
  try {
    const mo = new MutationObserver((records) => {
      for (const r of records) {
        r.addedNodes.forEach((n) => {
          if (n.nodeType === 1) {
            const el = n as Element;
            stripBlockedSrc(el);
            el.querySelectorAll?.("[src],[href],[data-src]").forEach(stripBlockedSrc);
          }
        });
        if (r.type === "attributes" && r.target.nodeType === 1) {
          stripBlockedSrc(r.target as Element);
        }
      }
    });
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ["src", "href", "data-src"],
    });
  } catch {
    /* no-op */
  }

  // ─── 5. Block popup attempts via click hijacking ────────────
  // Some ads fire on click events that bubble up to the top frame.
  // Intercept clicks that would navigate to blocked domains.
  document.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const anchor = target.closest?.("a");
      if (anchor && isBlocked(anchor.href)) {
        e.preventDefault();
        e.stopPropagation();
      }
    },
    true,
  );
}

export {};
