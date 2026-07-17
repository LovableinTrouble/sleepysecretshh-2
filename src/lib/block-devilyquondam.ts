// Client-only interceptor: silently blocks any network request to
// `devilyquondam.cyou` (and subdomains) by resolving it with an empty 200 OK.
// Runs as a side-effect import — no iframe sandboxing required.

if (typeof window !== "undefined") {
  const BLOCKED_HOST = "devilyquondam.cyou";

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
      return host === BLOCKED_HOST || host.endsWith("." + BLOCKED_HOST);
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
    XHR.prototype.open = function (
      this: XMLHttpRequest & { __blocked?: boolean },
      method: string,
      url: string | URL,
      ...rest: unknown[]
    ) {
      this.__blocked = isBlocked(url);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return origOpen.call(this, method, url as string, ...(rest as any));
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
}

export {};