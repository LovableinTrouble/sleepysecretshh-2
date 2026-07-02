import { useEffect, useState } from "react";
import { Copy, Check, X, Share2, Twitter, Facebook, MessageCircle, Send, Mail } from "lucide-react";

const KEY = "sleepy.share-popup.dismissed.v1";
const SITE_URL = "https://xullys.xyz";
const SHARE_TEXT = "Check out Sleepy — stream movies, TV, live sports & IPTV in one beautiful UI.";

export function SharePopup() {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(KEY);
      if (raw === "1") return;
      const snoozedUntil = raw ? Number(raw) : 0;
      if (snoozedUntil && Date.now() < snoozedUntil) return;
    } catch {}
    // Give users time to actually see the app before nagging them to share.
    const t = setTimeout(() => setOpen(true), 12000);
    return () => clearTimeout(t);
  }, []);

  const dismiss = () => {
    try { localStorage.setItem(KEY, "1"); } catch {}
    setOpen(false);
  };

  const remindLater = () => {
    // Snooze for a week — not permanent, still respectful.
    try { localStorage.setItem(KEY, String(Date.now() + 7 * 24 * 60 * 60 * 1000)); } catch {}
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
    { label: "Email", icon: Mail, href: `mailto:?subject=${enc("Check out Sleepy")}&body=${enc(SHARE_TEXT + "\n\n" + SITE_URL)}` },
  ];

  return (
    <div
      className="fixed inset-0 z-[90] flex items-end justify-center bg-black/60 backdrop-blur-sm p-4 sm:items-center animate-in fade-in duration-200"
      onClick={dismiss}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-b from-card to-background shadow-2xl animate-in slide-in-from-bottom-4 sm:zoom-in-95 duration-300"
      >
        <button
          onClick={dismiss}
          aria-label="Close"
          className="absolute right-3 top-3 z-10 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/80 hover:bg-black/70 hover:text-white transition"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="relative px-6 pt-8 pb-4 text-center">
          <div className="pointer-events-none absolute inset-x-0 -top-24 h-48 bg-gradient-to-b from-primary/25 to-transparent blur-3xl" />
          <div className="relative mx-auto mb-3 grid h-11 w-11 place-items-center rounded-2xl bg-primary/15 ring-1 ring-primary/30">
            <Share2 className="h-[18px] w-[18px] text-primary" />
          </div>
          <h2 className="relative text-[17px] font-semibold tracking-tight">Enjoying Sleepy?</h2>
          <p className="relative mx-auto mt-1 max-w-[280px] text-[13px] leading-snug text-muted-foreground">
            Share it with one friend who'd love streaming — that's how we grow.
          </p>
        </div>

        <div className="px-5 pb-5 space-y-3">
          <div className="flex items-center gap-1.5 rounded-2xl border border-white/10 bg-black/30 p-1.5">
            <div className="flex-1 truncate px-2.5 text-[13px] text-white/75 font-mono">{SITE_URL.replace(/^https?:\/\//, "")}</div>
            <button
              onClick={copy}
              className={`flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition ${
                copied ? "bg-emerald-500 text-white" : "bg-primary text-primary-foreground hover:bg-primary/90"
              }`}
            >
              {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>

          <div className="grid grid-cols-5 gap-1.5">
            {links.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Share on ${l.label}`}
                className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.03] py-2.5 transition hover:border-primary/40 hover:bg-primary/10"
              >
                <l.icon className="h-4 w-4 text-white/75 transition group-hover:text-primary" />
                <span className="text-[10px] text-white/60 group-hover:text-white">{l.label}</span>
              </a>
            ))}
          </div>

          <div className="flex items-center justify-center gap-4 pt-1">
            <button
              onClick={remindLater}
              className="text-[11px] text-muted-foreground hover:text-white transition"
            >
              Maybe later
            </button>
            <span className="h-3 w-px bg-white/10" />
            <button
              onClick={dismiss}
              className="text-[11px] text-muted-foreground hover:text-white transition"
            >
              Don't show again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}