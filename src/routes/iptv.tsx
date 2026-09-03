import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Search,
  Tv as Tv2,
  RadioTower,
  Star,
  Trophy,
  ArrowRight,
  Upload,
  Trash2,
  Link2,
  ClipboardPaste,
  Loader as Loader2,
} from "lucide-react";
import { fetchPpvAll, flattenEvents } from "@/lib/sports";
import {
  loadCustomPlaylists,
  saveCustomPlaylists,
  fetchAndParsePlaylist,
  parseM3U,
  type CustomPlaylist,
} from "@/lib/iptv-custom";
import { CURATED_CHANNELS, type CuratedChannel } from "@/lib/iptv-curated";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/iptv")({
  head: () => ({
    meta: [
      { title: "Live TV & Sports — Sleepy" },
      {
        name: "description",
        content: "Watch live TV channels and real-time sports matches — free.",
      },
      { property: "og:title", content: "Live TV & Sports — Sleepy" },
      {
        property: "og:description",
        content: "Live news, sports games and entertainment — all free.",
      },
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
    } catch {
      /* no-op */
    }
    setCustom(loadCustomPlaylists());
  }, []);

  const toggleFav = (id: string) => {
    setFavs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      try {
        localStorage.setItem("iptv:favs", JSON.stringify([...next]));
      } catch {
        /* no-op */
      }
      return next;
    });
  };

  const customChannels = useMemo(() => custom.flatMap((p) => p.channels), [custom]);

  // Combine channels: custom playlists + curated 24/7 broadcaster feeds.
  const channels = useMemo(() => {
    return [...customChannels, ...CURATED_CHANNELS];
  }, [customChannels]);

  const groups = useMemo(() => {
    const seen = new Map<string, number>();
    for (const c of channels) seen.set(c.group, (seen.get(c.group) ?? 0) + 1);
    const entries = Array.from(seen.entries()).sort((a, b) => a[0].localeCompare(b[0]));
    const base = ["All", ...entries.map(([g]) => g)];
    const withFavs = favs.size > 0 ? ["Favorites", ...base] : base;
    return custom.length > 0 ? [withFavs[0], "My Playlists", ...withFavs.slice(1)] : withFavs;
  }, [channels, favs, custom]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = channels.filter((c) => {
      if (group === "Favorites") {
        if (!favs.has(c.id)) return false;
      } else if (group === "My Playlists") {
        if (!c.id.startsWith("pl-") && !c.id.startsWith("custom-")) return false;
      } else if (group !== "All" && c.group !== group) return false;
      if (q && !c.name.toLowerCase().includes(q)) return false;
      return true;
    });
    if (group === "All" && favs.size > 0) {
      return [...list].sort((a, b) => Number(favs.has(b.id)) - Number(favs.has(a.id)));
    }
    return list;
  }, [channels, group, query, favs]);

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
      <header className="mx-auto max-w-7xl px-6 md:px-10">
        <LiveTabs active="tv" />
        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-3xl font-black tracking-tight md:text-5xl">Live TV</h1>
            <p className="mt-2 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span className="live-dot" aria-hidden="true" />
              <span>
                <span className="font-semibold text-foreground">{channels.length}</span> channels
                streaming right now
              </span>
              {favs.size > 0 && <span className="text-foreground/60">· {favs.size} favorites</span>}
              {customChannels.length > 0 && (
                <span className="text-foreground/60">· {customChannels.length} yours</span>
              )}
            </p>
          </div>
          <button
            onClick={() => setImportOpen(true)}
            className="snap-tile inline-flex shrink-0 items-center gap-2 rounded-full border border-glass-border bg-card/60 px-4 py-2 text-xs font-bold text-foreground/85 hover:border-primary/40 hover:text-foreground md:text-sm"
          >
            <Upload className="h-4 w-4" strokeWidth={2.4} />
            <span className="hidden sm:inline">Import playlist</span>
            <span className="sm:hidden">Import</span>
            {custom.length > 0 && (
              <span className="rounded-full bg-primary/20 px-1.5 text-[10px] font-bold text-primary">
                {custom.length}
              </span>
            )}
          </button>
        </div>
      </header>

      {/* Live Sports section */}
      <div className="mx-auto max-w-7xl">
        <LiveSportsRail />
      </div>

      {/* Channels */}
      <section className="mx-auto mt-10 max-w-7xl px-6 md:px-10">
        <div className="mb-3 flex items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-black tracking-tight md:text-xl">Channels</h2>
            <p className="text-xs text-muted-foreground">Verified 24/7 broadcaster feeds.</p>
          </div>
          <span className="text-xs font-semibold text-muted-foreground">
            {filtered.length} shown
          </span>
        </div>

        <div className="sticky top-2 z-20 rounded-2xl border border-glass-border bg-card/70 p-2 backdrop-blur-md">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search channels…"
              className="w-full rounded-xl bg-background/50 py-2 pl-9 pr-3 text-sm outline-none ring-1 ring-white/10 transition-shadow duration-150 focus:ring-2 focus:ring-primary/40"
            />
          </div>
          <div className="mt-2 -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 scrollbar-thin">
            {groups.map((g) => {
              const isActive = group === g;
              return (
                <button
                  key={g}
                  onClick={() => setGroup(g)}
                  className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold transition-colors duration-150 ${
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
                  className="snap-tile group relative flex w-full aspect-[4/3] flex-col items-center justify-between gap-2 overflow-hidden rounded-2xl border border-glass-border bg-card/40 p-3 text-center hover:border-primary/50 hover:bg-card/70"
                >
                  <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-black/60 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white/90 ring-1 ring-white/10 backdrop-blur">
                    <span className="live-dot" style={{ width: 5, height: 5 }} aria-hidden="true" />{" "}
                    Live
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
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    toggleFav(c.id);
                  }}
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
              No channels match your filters.
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

  const live = useMemo(() => (data ? flattenEvents(data) : []), [data]);
  const top = useMemo(
    () =>
      [...live]
        .sort((a, b) => Number(b.viewers || 0) - Number(a.viewers || 0))
        .slice(0, 10),
    [live],
  );

  return (
    <section className="mt-8 px-6 md:px-10">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Trophy className="h-4 w-4 text-amber-300" strokeWidth={2.4} />
          <h2 className="text-lg font-black tracking-tight md:text-xl">Live Sports</h2>
          {live.length > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
              <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" />
              {live.length}
            </span>
          )}
        </div>
        <Link
          to="/sports"
          preload="intent"
          className="group inline-flex items-center gap-1.5 text-xs font-bold text-foreground/70 transition-colors duration-150 hover:text-foreground"
        >
          All matches
          <ArrowRight className="h-3.5 w-3.5 transition-transform duration-150 group-hover:translate-x-0.5" />
        </Link>
      </div>

      {top.length === 0 ? (
        <div className="rounded-2xl border border-glass-border bg-card/40 px-4 py-6 text-xs text-muted-foreground">
          No live matches right now — only active streams appear here.
        </div>
      ) : (
        <div className="-mx-1 flex gap-3 overflow-x-auto px-1 pb-2 scrollbar-thin">
          {top.map((e) => (
            <Link
              key={e.id}
              to="/sports/$id"
              params={{ id: String(e.id) }}
              preload="intent"
              className="snap-tile group relative h-32 w-56 shrink-0 overflow-hidden rounded-2xl border border-glass-border bg-card/50 hover:border-amber-400/40"
            >
              {e.poster ? (
                <img
                  src={e.poster}
                  alt=""
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  className="absolute inset-0 h-full w-full object-cover opacity-55"
                />
              ) : (
                <div
                  className="absolute inset-0"
                  style={{
                    background: e.colors?.length
                      ? `linear-gradient(135deg, ${e.colors[0]} 0%, #000 75%)`
                      : "linear-gradient(135deg, rgba(251,191,36,0.18), rgba(0,0,0,0.65))",
                  }}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/92 via-black/45 to-black/15" />
              <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-destructive/90 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white animate-pulse" /> Live
              </span>
              <div className="absolute inset-x-0 bottom-0 p-3">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/70">
                  {e.category}
                </div>
                <div className="mt-0.5 line-clamp-2 text-xs font-bold leading-tight text-white">
                  {e.name}
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function ImportPlaylistDialog({
  open,
  onOpenChange,
  playlists,
  onSave,
  onRemove,
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

  const reset = () => {
    setName("");
    setUrl("");
    setText("");
    setError(null);
    setBusy(false);
  };

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
        if (!text.includes("#EXTINF"))
          throw new Error("This doesn't look like an M3U file (no #EXTINF lines).");
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
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg">
            <Upload className="h-4 w-4 text-primary" /> Import IPTV playlist
          </DialogTitle>
          <DialogDescription>
            Add an M3U / M3U8 playlist by URL or paste its contents. Saved locally on your device —
            never sent to our servers.
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
            <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
              Playlist name
            </span>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Playlist"
              className="w-full rounded-xl bg-background/60 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary/40"
            />
          </label>
          {mode === "url" ? (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                Playlist URL
              </span>
              <input
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/playlist.m3u"
                className="w-full rounded-xl bg-background/60 px-3 py-2 text-sm outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-primary/40"
              />
            </label>
          ) : (
            <label className="block">
              <span className="mb-1 block text-[11px] uppercase tracking-wider text-muted-foreground">
                M3U contents
              </span>
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={6}
                placeholder='#EXTM3U&#10;#EXTINF:-1 tvg-logo="..." group-title="News",My Channel&#10;https://example.com/stream.m3u8'
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
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-xl bg-white/5 px-3 py-2 ring-1 ring-white/10"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="truncate text-[11px] text-muted-foreground">
                      {p.channels.length} channels ·{" "}
                      {p.source.length > 40 ? p.source.slice(0, 40) + "…" : p.source}
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
