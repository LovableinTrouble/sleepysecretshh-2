import { Check, ChevronRight, Cloud, Sparkles, X } from "lucide-react";
import { Link } from "@tanstack/react-router";

import { EMBED_SERVERS, type ServerId } from "@/lib/embed-servers";
import { useSettings } from "@/lib/store";

interface Props {
  lastServer: ServerId | null;
  onPick: (id: ServerId) => void;
  onClose: () => void;
}

export function ServerPicker({ lastServer, onPick, onClose }: Props) {
  const [settings, setSettings] = useSettings();
  const hasFebbox = Boolean(settings.integrations.febboxCookie?.trim());

  return (
    <div className="fixed inset-0 z-[2147483000] flex items-center justify-center bg-black/80 p-4 backdrop-blur-xl">
      <div className="w-full max-w-md overflow-hidden rounded-3xl border border-white/10 bg-background/80 shadow-2xl backdrop-blur-2xl">
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Choose a server</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Pick what to prioritize — interface or stream quality.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded-full border border-white/10 p-1.5 text-muted-foreground transition hover:text-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-5 space-y-2.5 px-4">
          {EMBED_SERVERS.map((s) => (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="group flex w-full items-center gap-3.5 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3.5 text-left transition hover:border-primary/50 hover:bg-primary/10"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.06] text-primary">
                {s.id === "edge" ? <Sparkles className="h-5 w-5" /> : <Cloud className="h-5 w-5" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{s.name}</span>
                  {lastServer === s.id && (
                    <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-primary">
                      Last used
                    </span>
                  )}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {s.tagline}
                  {s.supportsFebbox ? " · Febbox supported" : ""}
                </span>
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-primary" />
            </button>
          ))}
        </div>

        <div className="mt-4 space-y-3 border-t border-white/10 px-5 py-4">
          <label className="flex cursor-pointer items-center justify-between gap-3">
            <span className="text-xs text-muted-foreground">
              Remember my choice for next time
            </span>
            <span
              onClick={(e) => {
                e.preventDefault();
                setSettings({ rememberServerChoice: !settings.rememberServerChoice });
              }}
              className={`flex h-5 w-9 shrink-0 items-center rounded-full border transition ${
                settings.rememberServerChoice
                  ? "justify-end border-primary bg-primary/70"
                  : "justify-start border-white/15 bg-white/10"
              }`}
            >
              <span className="m-0.5 h-4 w-4 rounded-full bg-white shadow" />
            </span>
          </label>

          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              {hasFebbox && <Check className="h-3.5 w-3.5 text-primary" />}
              Febbox {hasFebbox ? "connected" : "not set"}
            </span>
            <Link to="/settings" className="font-semibold text-primary hover:underline">
              {hasFebbox ? "Manage" : "Add key"}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}