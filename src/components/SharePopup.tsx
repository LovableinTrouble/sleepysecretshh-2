import { useEffect, useState } from "react";
import { Copy, Check, X, Share2, Twitter, Facebook, MessageCircle, Send, Mail } from "lucide-react";

const KEY = "sleepy.share-popup.dismissed.v1";
const SITE_URL = "https://sleepysecretshh.lovable.app";
const SHARE_TEXT = "Check out VOID — stream movies, TV, live sports & IPTV in one beautiful UI.";

export function SharePopup() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(KEY)) return;
    } catch {}
    const t = setTimeout(() => setOpen(true), 1500);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(SITE_URL);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {}
  };

  if (!open) return null;

  const enc = encodeURIComponent;
  const links = [
    { label: "X", icon: Twitter, href: `https://twitter.com/intent/tweet?text=${enc(SHARE_TEXT)}&url=${enc(SITE_URL)}` },
    { label: "Facebook", icon: Facebook, href: `https://www.facebook.com/sharer/sharer.php?u=${enc(SITE_URL)}` },
    { label: "WhatsApp", icon: MessageCircle, href: `https://wa.me/?text=${enc(SHARE_TEXT + " " + SITE_URL)}` },
    { label: "Telegram", icon: Send, href: `https://t.me/share/url?url=${enc(SITE_URL)}&text=${enc(SHARE_TEXT)}` },
    { label: "Email", icon: Mail, href: `mailto:?subject=${enc("Check out VOID")}&body=${enc(SHARE_TEXT + "\n\n" + SITE_URL)}` },
  ];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center animate-in fade-in duration-200"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-md overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-b from-card to-background shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-6 pt-7 pb-5 text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-primary/30 to-transparent blur-3xl" />
          <div className="relative mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-primary/15 ring-1 ring-primary/30">
            <Share2 className="h-5 w-5 text-primary" />
          </div>
          <h2 className="relative text-lg font-semibold tracking-tight">Help VOID grow</h2>
          <p className="relative mt-1 text-sm text-muted-foreground">
            Share with a friend who'd love it. It takes a second and means a lot.
          </p>
        </div>

        <div className="px-6 pb-6 space-y-4">
          <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/30 p-1.5">
            <div className="flex-1 truncate px-3 text-sm text-white/80 font-mono">{SITE_URL}</div>
            <button
              onClick={copy}
              className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold transition ${
                copied ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy"}
            </button>
          </div>

          <div className="grid grid-cols-5 gap-2">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Share on ${l.label}`}
                className="group flex flex-col items-center gap-1.5 rounded-xl border border-white/5 bg-white/[0.03] py-3 transition hover:border-primary/40 hover:bg-primary/10"
              >
                <l.icon className="h-4 w-4 text-white/80 transition group-hover:text-primary" />
                <span className="text-[10px] text-white/60 group-hover:text-white">{l.label}</span>
              </a>
            ))}
          </div>

          <button
            onClick={dismiss}
            className="w-full text-center text-xs text-muted-foreground hover:text-white transition"
          >
            Maybe later
          </button>
        </div>
      </div>
    </div>
  );
}