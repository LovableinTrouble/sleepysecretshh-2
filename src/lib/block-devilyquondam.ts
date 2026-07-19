// Client-only interceptor: silently blocks any network request to
// `devilyquondam.cyou` (and subdomains) by resolving it with an empty 200 OK.
// Runs as a side-effect import — no iframe sandboxing required.

if (typeof window !== "undefined") {
  const BLOCKED_HOSTS = [
    "devilyquondam.cyou",
    "guarriancha.qpon",
    "jivingafrithm.cyou",
  ];

  const hostBlocked = (host: string): boolean => {
    const h = host.toLowerCase();
    return BLOCKED_HOSTS.some((b) => h === b || h.endsWith("." + b));
  };

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
      return hostBlocked(host);
    } catch {
      return false;
    }
  };

  const emptyResponse = () =>
    new Response("", {
      status: 200,
      statusText: "OK",
      headers: { "content-type": "text/plain" },
    });

  // fetch
  const origFetch = window.fetch?.bind(window);
  if (origFetch) {
    window.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      if (isBlocked(input)) return Promise.resolve(emptyResponse());
      return origFetch(input, init);
    }) as typeof window.fetch;
  }

  // XHR
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

  // sendBeacon
  if (navigator.sendBeacon) {
    const origBeacon = navigator.sendBeacon.bind(navigator);
    navigator.sendBeacon = ((url: string | URL, data?: BodyInit | null) => {
      if (isBlocked(url)) return true;
      return origBeacon(url, data);
    }) as typeof navigator.sendBeacon;
  }

  // WebSocket
  const OrigWS = window.WebSocket;
  if (OrigWS) {
    const Patched = function (this: unknown, url: string | URL, protocols?: string | string[]) {
      if (isBlocked(url)) {
        // Return a dummy object that mimics a closed socket.
        const dummy: Partial<WebSocket> & Record<string, unknown> = {
          readyState: 3,
          url: String(url),
          send: () => {},
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        };
        return dummy as WebSocket;
      }
      return new OrigWS(url, protocols);
    } as unknown as typeof WebSocket;
    Patched.prototype = OrigWS.prototype;
    (Patched as unknown as { CONNECTING: number }).CONNECTING = OrigWS.CONNECTING;
    (Patched as unknown as { OPEN: number }).OPEN = OrigWS.OPEN;
    (Patched as unknown as { CLOSING: number }).CLOSING = OrigWS.CLOSING;
    (Patched as unknown as { CLOSED: number }).CLOSED = OrigWS.CLOSED;
    window.WebSocket = Patched;
  }

  // EventSource
  const OrigES = window.EventSource;
  if (OrigES) {
    const Patched = function (this: unknown, url: string | URL, init?: EventSourceInit) {
      if (isBlocked(url)) {
        return {
          readyState: 2,
          url: String(url),
          withCredentials: false,
          onmessage: null,
          onopen: null,
          onerror: null,
          close: () => {},
          addEventListener: () => {},
          removeEventListener: () => {},
          dispatchEvent: () => false,
        } as unknown as EventSource;
      }
      return new OrigES(url, init);
    } as unknown as typeof EventSource;
    Patched.prototype = OrigES.prototype;
    window.EventSource = Patched;
  }

  // <img>, <script>, <link>, <iframe>, <source> injected into parent DOM.
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
}

export {};