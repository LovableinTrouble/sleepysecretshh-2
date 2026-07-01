import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Search, Tv2, RadioTower, Star, Trophy, ArrowRight, Upload, Trash2, Link2, ClipboardPaste, Loader2 } from "lucide-react";
import { fetchPpvAll, flattenEvents } from "@/lib/sports";
import {
  loadCustomPlaylists,
  saveCustomPlaylists,
  fetchAndParsePlaylist,
  parseM3U,
  type CustomPlaylist,
} from "@/lib/iptv-custom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/iptv")({
  head: () => ({
    meta: [
      { title: "Live TV & Sports — Sleepy" },
      { name: "description", content: "Watch live TV channels and real-time sports matches — free." },
      { property: "og:title", content: "Live TV & Sports — Sleepy" },
      { property: "og:description", content: "Live news, sports games and entertainment — all free." },
    ],
  }),
  component: IptvPage,
});

function proxyLogo(url?: string): string | undefined {
  if (!url) return undefined;
  const clean = url.replace(/^https?:\/\//, "");
  return `https://images.weserv.nl/?url=${encodeURIComponent(clean)}&w=160&h=160&fit=contain&output=png&n=-1`;
}

function IptvPage() {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<string>("All");
  const [favs, setFavs] = useState<Set<string>>(() => new Set());
  const [custom, setCustom] = useState<CustomPlaylist[]>([]);
  const [importOpen, setImportOpen] = useState(false);

  useEffect(() => {
    try {
      const raw = localStorage.getItem("iptv:favs");
      if (raw) setFavs(new Set(JSON.parse(raw)));
    } catch {}
    setCustom(loadCustomPlaylists());
  }, []);

  // TouStream channels — fetched live. Slugs become channel ids and the
  // player URL is https://toustream.xyz/tou/live/{slug}. We render these
  // via <iframe> in the live route because they're first-party embeds.
  const { data: touChannels = [], isLoading: touLoading } = useQuery({
    queryKey: ["toustream", "channels"],
    queryFn: async () => {
      const res = await fetch("https://toustream.xyz/tou/api/channels");
      if (!res.ok) throw new Error("Failed to load channels");
      const raw = (await res.json()) as Array<{ slug: string; name?: string; image?: string; category?: string }>;
      return raw.map((c) => ({
        id: `tou-${c.slug}`,
        name: c.name || c.slug,
        logo: c.image,
        url: `https://toustream.xyz/tou/live/${c.slug}`,
        group: (c.category && c.category.trim()) || "Live TV",
      }));
    },
    staleTime: 15 * 60_000,
  });

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      try { localStorage.setItem("iptv:favs", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  const customChannels = useMemo(() => custom.flatMap((p) => p.channels), [custom]);
  const channels = useMemo(() => [...customChannels, ...touChannels], [customChannels, touChannels]);

  const groups = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of channels) seen.set(c.group, (seen.get(c.group) ?? 0) + 1);
    const entries = Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const base = ["All", ...entries.map(([g]) => g)];
    const withFavs = favs.size > 0 ? ["Favorites", ...base] : base;
    return custom.length > 0
      ? [withFavs[0], "My Playlists", ...withFavs.slice(1)]
      : withFavs;
  }, [channels, favs, custom]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = channels.filter((c) => {
      if (group === "Favorites") { if (!favs.has(c.id)) return false; }
      else if (group === "My Playlists") { if (!c.id.startsWith("pl-") && !c.id.startsWith("custom-")) return false; }
      else if (group !== "All" && c.group !== group) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (group === "All" && favs.size > 0) {
      return [...list].sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
    }
    return list;
  }, [channels, group, query, favs]);

  const isLoading = touLoading && touChannels.length === 0;

  const handleSavePlaylist = (pl: CustomPlaylist) => {
    const next = [...custom.filter((p) => p.id !== pl.id), pl];
    setCustom(next);
    saveCustomPlaylists(next);
  };
  const handleRemovePlaylist = (id: string) => {
    const next = custom.filter((p) => p.id !== id);
    setCustom(next);
    saveCustomPlaylists(next);
  };

  return (
    <div className="relative min-h-screen pb-32 pt-20 md:pb-12 md:pt-12 animate-page-in">
      <header className="px-6 md:px-10">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/15 text-primary ring-1 ring-primary/30">
              <RadioTower className="h-6 w-6" strokeWidth={2.2} />
            </div>
            <div>
              <div className="text-xs uppercase tracking-[0.4em] text-primary/80">Live · Free</div>
              <h1 className="text-3xl font-black md:text-5xl">Live TV</h1>
            </div>
          </div>
          <button
            onClick={() => setImportOpen(true)}
            className="mt-1 inline-flex shrink-0 items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary ring-1 ring-primary/20 transition hover:bg-primary/15 md:text-sm"
          >
            <Upload className="h-4 w-4" strokeWidth={2.4} />
            <span className="hidden sm:inline">Import playlist</span>
            <span className="sm:hidden">Import</span>
            {custom.length > 0 && (
              <span className="rounded-full bg-primary/25 px-1.5 text-[10px] font-bold">{custom.length}</span>
            )}
          </button>
        </div>
        <p className="mt-3 max-w-xl text-sm text-muted-foreground flex items-center gap-2 flex-wrap">
          <span className="live-dot" aria-hidden="true" />
          <span><span className="font-semibold text-foreground">{channels.length}</span> channels + live sports right now.</span>
          {favs.size > 0 && <span className="text-foreground/70">· {favs.size} favorited</span>}
          {customChannels.length > 0 && <span className="text-foreground/70">· {customChannels.length} yours</span>}
        </p>
      </header>

      {/* Live Sports section */}
      <LiveSportsRail />

      {/* Channels */}
      <section className="mt-10 px-6 md:px-10">
        <div className="mb-4 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-xl font-black tracking-tight md:text-2xl">Channels</h2>
            <p className="text-xs text-muted-foreground">Verified 24/7 broadcaster feeds.</p>
          </div>
        </div>

        <div className="rounded-2xl border border-glass-border bg-card/40 p-2 backdrop-blur">
          <div className="flex flex-col gap-2 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search channels…"
                className="w-full rounded-xl bg-background/40 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 transition focus:ring-2 focus:ring-primary/40"
              />
            </div>
          </div>
          <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
            {groups.map((g) => {
              const isActive = group === g;
              return (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "bg-white/5 text-white/65 hover:bg-white/10 hover:text-white"
                  }`}
                >
                  {g}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
          {filtered.map((c) => {
            const isFav = favs.has(c.id);
            return (
              <div key={c.id} className="relative">
                <Link
                  to="/live/$id"
                  params={{ id: c.id }}
                  search={{ url: c.url, name: c.name, logo: c.logo, group: c.group }}
                  preload="intent"
                  className="group relative flex w-full aspect-[4/3] flex-col items-center justify-between gap-2 overflow-hidden rounded-2xl border border-glass-border bg-card/40 p-3 text-center transition active:scale-[0.98] hover:-translate-y-0.5 hover:border-primary/50 hover:bg-card/70"
                >
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/10 backdrop-blur">
                    <span className="live-dot" style={{ width: 5, height: 5 }} aria-hidden="true" /> Live
                  </span>
                  <div className="relative grid h-16 w-16 place-items-center overflow-hidden rounded-xl bg-gradient-to-br from-white/10 to-black/30 ring-1 ring-white/10">
                    <span className="absolute text-sm font-black tracking-wide text-white/55">
                      {c.name
                        .replace(/\b(the|hd|tv|channel|live|sd|fhd|uhd|\d+)\b/gi, "")
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((w) => w[0])
                        .join("")
                        .toUpperCase() || <Tv2 className="h-6 w-6 text-white/40" />}
                    </span>
                    {c.logo && (
                      <img
                        src={proxyLogo(c.logo)}
                        alt=""
                        loading="lazy"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          const img = e.currentTarget;
                          if (img.dataset.fallback !== "1" && c.logo) {
                            img.dataset.fallback = "1";
                            img.src = c.logo;
                            return;
                          }
                          img.style.display = "none";
                        }}
                        className="relative h-full w-full object-contain"
                      />
                    )}
                  </div>
                  <span className="line-clamp-2 text-xs font-semibold text-foreground/90 group-hover:text-foreground">
                    {c.name}
                  </span>
                </Link>
                <button
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); toggleFav(c.id); }}
                  aria-label={isFav ? "Remove from favorites" : "Add to favorites"}
                  className={`absolute right-2 top-2 z-10 grid h-8 w-8 place-items-center rounded-full backdrop-blur transition ${
                    isFav
                      ? "bg-primary/90 text-primary-foreground ring-1 ring-primary/60"
                      : "bg-black/55 text-white/70 ring-1 ring-white/15 hover:bg-black/80 hover:text-white"
                  }`}
                >
                  <Star className={`h-3.5 w-3.5 ${isFav ? "fill-current" : ""}`} />
                </button>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div className="col-span-full py-16 text-center text-sm text-muted-foreground">
              {isLoading ? "Loading channels…" : "No channels match your filters."}
            </div>
          )}
        </div>
      </section>

      <ImportPlaylistDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        playlists={custom}
        onSave={handleSavePlaylist}
        onRemove={handleRemovePlaylist}
      />
    </div>
  );
}

function LiveSportsRail() {
  const { data } = useQuery({
    queryKey: ["ppv", "all"],
    queryFn: fetchPpvAll,
    staleTime: 60_000,
    refetchInterval: 120_000,
  });

  const events = useMemo(() => {
    if (!data) return { live: 0 };
    return { live: flattenEvents(data).length };
  }, [data]);

  return (
    <section className="mt-8 px-6 md:px-10">
      <Link
        to="/sports"
        className="group relative flex items-center gap-4 overflow-hidden rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-500/[0.08] via-card/40 to-card/40 p-4 ring-1 ring-white/5 transition hover:border-amber-500/40 hover:bg-amber-500/[0.06] md:p-5"
      >
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-300 ring-1 ring-amber-500/30">
          <Trophy className="h-5 w-5" strokeWidth={2.2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h2 className="text-base font-black tracking-tight md:text-lg">Live Sports</h2>
            {events.live > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full bg-red-500/90 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
                {events.live} live
              </span>
            )}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {events.live > 0
              ? `${events.live} match${events.live === 1 ? "" : "es"} airing now`
              : "No live matches right now — only active streams appear."}
          </p>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs font-semibold text-white ring-1 ring-white/15 transition group-hover:bg-white/15">
          View matches <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
        </span>
      </Link>
    </section>
  );
}

function ImportPlaylistDialog({
  open, onOpenChange, playlists, onSave, onRemove,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  playlists: CustomPlaylist[];
  onSave: (p: CustomPlaylist) => void;
  onRemove: (id: string) => void;
}) {
  const [mode, setMode] = useState<"url" | "paste">("url");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = () => { setName(""); setUrl(""); setText(""); setError(null); setBusy(false); };

  const submit = async () => {
    setError(null);
    const finalName = name.trim() || "My Playlist";
    try {
      setBusy(true);
      let channels;
      if (mode === "url") {
        if (!/^https?:\/\//i.test(url.trim())) throw new Error("Enter a valid http(s) URL.");
        channels = await fetchAndParsePlaylist(url.trim(), finalName);
      } else {
        if (!text.includes("#EXTINF")) throw new Error("This doesn't look like an M3U file (no #EXTINF lines).");
        channels = parseM3U(text, finalName);
      }
      if (channels.length === 0) throw new Error("No channels found in this playlist.");
      onSave({
        id: `pl-${Date.now()}`,
        name: finalName,
        source: mode === "url" ? url.trim() : "Pasted M3U",
        addedAt: Date.now(),
        channels,
      });
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to import playlist.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-4 w-4 text-primary" /> Import IPTV playlist
          </DialogTitle>
          <DialogDescription>
            Add an M3U / M3U8 playlist by URL or paste its contents. Saved locally on your device — never sent to our servers.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 inline-flex rounded-full bg-white/5 p-1 text-xs font-semibold ring-1 ring-white/10">
          <button
            onClick={() => setMode("url")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${mode === "url" ? "bg-primary text-primary-foreground" : "text-white/65 hover:text-white"}`}
          >
            <Link2 className="h-3.5 w-3.5" /> From URL
          </button>
          <button
            onClick={() => setMode("paste")}
            className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 transition ${mode === "paste" ? "bg-primary text-primary-foreground" : "text-white/65 hover:text-white"}`}
          >
            <ClipboardPaste className="h-3.5 w-3.5" /> Paste M3U
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">Playlist name</span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Playlist"
              className="w-full rounded-xl bg-background/60 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary/40"
            />
          </label>
          {mode === "url" ? (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">Playlist URL</span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u"
                className="w-full rounded-xl bg-background/60 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary/40"
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">M3U contents</span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-logo=&quot;...&quot; group-title=&quot;News&quot;,My Channel&#10;https://example.com/stream.m3u8"
                className="w-full rounded-xl bg-background/60 px-3 py-2 font-mono text-xs outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary/40"
              />
            </label>
          )}

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}

          <button
            onClick={submit}
            disabled={busy || (mode === "url" ? !url.trim() : !text.trim())}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground transition hover:opacity-90 disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            {busy ? "Importing…" : "Import playlist"}
          </button>
        </div>

        {playlists.length > 0 && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <div className="mb-2 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              Your playlists ({playlists.length})
            </div>
            <ul className="space-y-2">
              {playlists.map((p) => (
                <li key={p.id} className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p.channels.length} channels · {p.source.length > 40 ? p.source.slice(0, 40) + "…" : p.source}
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(p.id)}
                    aria-label="Remove playlist"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-red-500/15 text-red-300 transition hover:bg-red-500/25"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
