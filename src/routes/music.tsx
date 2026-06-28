import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Search, Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, Repeat,
  Heart, Plus, ListMusic, Trash2, X, Shuffle, Clock, ExternalLink, ListOrdered, Download, Loader2,
} from "lucide-react";

// Clean custom music note glyph used in the header
function NoteIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path d="M9 18V6.2a1 1 0 0 1 .8-.98l8-1.6A1 1 0 0 1 19 4.6V16"
            stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor"/>
      <circle cx="16.5" cy="16" r="2.5" fill="currentColor"/>
    </svg>
  );
}
import {
  searchITunes, searchYouTube, fetchLyrics,
  loadPlaylists, savePlaylists, loadLiked, saveLiked,
  loadRecent, pushRecent, clearRecent,
  importInvidiousPlaylist,
  type Track, type Playlist,
} from "@/lib/music";
import {
  useMusicPlayer,
  play as mpPlay,
  toggle as mpToggle,
  next as mpNext,
  prev as mpPrev,
  seek as mpSeek,
  setVolume as mpSetVolume,
  setMuted as mpSetMuted,
  setRepeat as mpSetRepeat,
} from "@/lib/music-player";

export const Route = createFileRoute("/music")({
  head: () => ({
    meta: [
      { title: "Music — Sleepy" },
      { name: "description", content: "Search and play music with synced lyrics and personal playlists." },
    ],
  }),
  component: MusicPage,
});

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60).toString().padStart(2, "0");
  return `${m}:${sec}`;
}

function fmtMs(ms?: number) {
  if (!ms) return "";
  return fmt(ms / 1000);
}

const TRENDING = ["Taylor Swift", "The Weeknd", "Drake", "Billie Eilish", "Kendrick Lamar", "SZA"];

function MusicPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const mp = useMusicPlayer();
  const { current, queue, queueIdx, playing, muted, repeat, progress, duration, volume } = mp;

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [liked, setLiked] = useState<Track[]>([]);
  const [view, setView] = useState<"home" | "liked" | string>("home"); // string = playlist id
  const [pickerFor, setPickerFor] = useState<Track | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [showQueue, setShowQueue] = useState(false);
  const [libQuery, setLibQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [recentPlayed, setRecentPlayed] = useState<Track[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlName, setNewPlName] = useState("");
  const [pickerCreateMode, setPickerCreateMode] = useState(false);

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const [bg, setBg] = useState<[number, number, number]>([40, 40, 60]);
  const artRef = useRef<HTMLImageElement>(null);

  useEffect(() => { setPlaylists(loadPlaylists()); setLiked(loadLiked()); setRecent(loadRecent()); }, []);

  useEffect(() => {
    try { setRecentPlayed(JSON.parse(localStorage.getItem("sleepy.music.recentplayed.v1") || "[]")); } catch {}
  }, []);

  const totalActiveMs = useMemo(() => {
    return 0; // computed via activeList below; placeholder so refs resolve
  }, []);

  async function handleImport() {
    setImporting(true); setImportError(null);
    try {
      const res = await importInvidiousPlaylist(importUrl);
      if (!res || !res.tracks.length) { setImportError("Couldn't load that playlist. Check the link."); return; }
      const np: Playlist = { id: crypto.randomUUID(), name: res.name, tracks: res.tracks, createdAt: Date.now() };
      const next = [np, ...playlists];
      setPlaylists(next); savePlaylists(next);
      setView(np.id);
      setImportOpen(false); setImportUrl("");
    } catch { setImportError("Import failed. Try a different playlist."); }
    finally { setImporting(false); }
  }

  // keyboard: space=play/pause, / focus search
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/") { e.preventDefault(); searchInputRef.current?.focus(); }
      else if (e.code === "Space") { e.preventDefault(); mpToggle(); }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // hide search results when clicking outside
  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!searchWrapperRef.current) return;
      if (!searchWrapperRef.current.contains(e.target as Node)) {
        setShowSearch(false);
      }
    };
    window.addEventListener("mousedown", onDown);
    return () => window.removeEventListener("mousedown", onDown);
  }, []);

  // search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults([]); return; }
    setSearching(true);
    const t = setTimeout(async () => {
      try { setResults(await searchITunes(q)); } finally { setSearching(false); }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // play
  const play = useCallback(async (t: Track, list?: Track[], idx?: number) => {
    setLyrics(null);
    setShowLyrics(false);
    setShowSearch(false);
    setQuery("");
    if (query.trim().length >= 2) setRecent(pushRecent(query.trim()));
    setRecentPlayed(prev => {
      const next = [t, ...prev.filter(x => x.id !== t.id)].slice(0, 12);
      try { localStorage.setItem("sleepy.music.recentplayed.v1", JSON.stringify(next)); } catch {}
      return next;
    });
    await mpPlay(t, list, idx);
  }, [query]);

  const next = mpNext;
  const prev = mpPrev;
  const toggle = mpToggle;

  // Load lyrics whenever the globally-current track changes.
  useEffect(() => {
    if (!current) { setLyrics(null); return; }
    let cancelled = false;
    setLyrics(null);
    fetchLyrics(current.artist, current.title).then((l) => { if (!cancelled) setLyrics(l); });
    return () => { cancelled = true; };
  }, [current?.id]);

  // ambient color from album art
  const onArtLoad = () => {
    const img = artRef.current; if (!img) return;
    try {
      const c = document.createElement("canvas");
      c.width = 16; c.height = 16;
      const ctx = c.getContext("2d"); if (!ctx) return;
      ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i+1]; b += d[i+2]; n++; }
      setBg([Math.round(r/n), Math.round(g/n), Math.round(b/n)]);
    } catch {}
  };

  // playlists
  const createPlaylist = (name?: string): Playlist | null => {
    const n = (name ?? "").trim();
    if (!n) return null;
    const np: Playlist = { id: crypto.randomUUID(), name: n, tracks: [], createdAt: Date.now() };
    const next = [np, ...playlists];
    setPlaylists(next); savePlaylists(next);
    return np;
  };
  const openCreate = () => { setNewPlName(""); setCreateOpen(true); };
  const submitCreate = () => {
    const np = createPlaylist(newPlName);
    if (!np) return;
    setCreateOpen(false);
    if (pickerFor) { addToPlaylist(np.id, pickerFor); }
    setPickerCreateMode(false);
  };
  const deletePlaylist = (id: string) => {
    const next = playlists.filter(p => p.id !== id);
    setPlaylists(next); savePlaylists(next);
    if (view === id) setView("home");
  };
  const addToPlaylist = (plId: string, t: Track) => {
    const next = playlists.map(p => p.id === plId
      ? { ...p, tracks: p.tracks.some(x => x.id === t.id) ? p.tracks : [...p.tracks, t] }
      : p);
    setPlaylists(next); savePlaylists(next);
    setPickerFor(null);
  };
  const removeFromPlaylist = (plId: string, tid: string) => {
    const next = playlists.map(p => p.id === plId ? { ...p, tracks: p.tracks.filter(t => t.id !== tid) } : p);
    setPlaylists(next); savePlaylists(next);
  };
  const toggleLike = (t: Track) => {
    if (!t || !t.id) return;
    const has = liked.some(x => x.id === t.id);
    const next = has
      ? liked.filter(x => x.id !== t.id)
      : [t, ...liked.filter(x => x.id !== t.id)];
    setLiked(next); saveLiked(next);
  };
  const clearLiked = () => { setLiked([]); saveLiked([]); };
  const isLiked = (t?: Track | null) => !!t && liked.some(x => x.id === t.id);

  const activeList: Track[] = useMemo(() => {
    if (view === "liked") return liked;
    const pl = playlists.find(p => p.id === view);
    return pl?.tracks || [];
  }, [view, liked, playlists]);

  const seek = (pct: number) => {
    const p = playerRef.current; if (!p?.getDuration) return;
    const d = p.getDuration(); p.seekTo(d * pct, true);
  };

  const shuffle = () => {
    if (!activeList.length) return;
    const sh = [...activeList].sort(() => Math.random() - 0.5);
    play(sh[0], sh, 0);
  };

  const [r, g, b] = bg;
  const grad = `radial-gradient(1200px 800px at 20% 0%, rgba(${r},${g},${b},0.55), transparent 60%), radial-gradient(900px 700px at 100% 100%, rgba(${Math.max(0,r-30)},${Math.max(0,g-30)},${Math.max(0,b-30)},0.55), transparent 60%), #0a0a0f`;

  return (
    <div className="fixed inset-0 z-30 flex flex-col text-foreground transition-[background] duration-700 overflow-hidden" style={{ background: grad }}>
      <div ref={containerRef} className="absolute -z-10 h-0 w-0 overflow-hidden" />

      {/* Top bar */}
      <header className="flex items-center gap-3 px-4 py-3 md:grid md:grid-cols-[1fr_auto_1fr] md:px-6">
        <div className="hidden items-center gap-2 text-lg font-bold tracking-tight md:flex">
          <NoteIcon className="h-5 w-5 text-white/90" /> Music
        </div>
        <div ref={searchWrapperRef} className="relative mx-auto w-full max-w-xl flex-1 justify-self-center md:flex-none">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setShowSearch(true); }}
            onFocus={() => setShowSearch(true)}
            placeholder="Search songs, artists, albums…"
            className="w-full rounded-full bg-white/10 py-2.5 pl-10 pr-16 text-sm text-white placeholder:text-white/50 outline-none ring-1 ring-white/10 backdrop-blur focus:bg-white/15 focus:ring-white/30"
          />
          {query ? (
            <button onClick={() => { setQuery(""); setResults([]); searchInputRef.current?.focus(); }} className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white" aria-label="Clear"><X className="h-3.5 w-3.5" /></button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">/</kbd>
          )}
          {showSearch && (
            <div className="absolute left-0 right-0 top-full z-50 mt-2 max-h-[60vh] overflow-y-auto rounded-2xl bg-black/80 p-2 ring-1 ring-white/10 backdrop-blur-xl">
              {searching && <div className="p-3 text-sm text-white/60">Searching…</div>}
              {!searching && !results.length && (
                <div className="p-2">
                  {recent.length > 0 && (
                    <div className="mb-2">
                      <div className="mb-1 flex items-center justify-between px-2 text-[11px] uppercase tracking-widest text-white/40">
                        <span>Recent</span>
                        <button onClick={() => { clearRecent(); setRecent([]); }} className="text-white/40 hover:text-white">Clear</button>
                      </div>
                      <div className="flex flex-wrap gap-1.5 px-1">
                        {recent.map(r => (
                          <button key={r} onClick={() => setQuery(r)} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15">{r}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mb-1 px-2 text-[11px] uppercase tracking-widest text-white/40">Trending</div>
                  <div className="flex flex-wrap gap-1.5 px-1">
                    {TRENDING.map(r => (
                      <button key={r} onClick={() => setQuery(r)} className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15">{r}</button>
                    ))}
                  </div>
                </div>
              )}
              {results.map((t, i) => (
                <button
                  key={t.id}
                  onClick={() => play(t, results, i)}
                  className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10"
                >
                  <img src={t.artwork} alt="" className="h-10 w-10 rounded-md" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.title}</div>
                    <div className="truncate text-xs text-white/60">
                      {t.artist}
                      {t.year ? <span className="text-white/40"> · {t.year}</span> : null}
                      {t.genre ? <span className="text-white/40"> · {t.genre}</span> : null}
                    </div>
                  </div>
                  {t.durationMs ? <span className="hidden text-[11px] tabular-nums text-white/50 sm:inline">{fmtMs(t.durationMs)}</span> : null}
                  <Plus
                    className="h-4 w-4 shrink-0 text-white/60 hover:text-white"
                    onClick={(e) => { e.stopPropagation(); setPickerFor(t); }}
                  />
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="hidden md:block" />
      </header>

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-48 md:px-6 md:pb-52">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col gap-4 rounded-2xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur md:flex">
          <nav className="flex flex-col gap-1.5">
            <button onClick={() => setView("home")} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${view==="home"?"bg-white/15 font-semibold":"hover:bg-white/10"}`}>
              <NoteIcon className="h-4 w-4" /> Home
            </button>
            <button onClick={() => setView("liked")} className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${view==="liked"?"bg-white/15 font-semibold":"hover:bg-white/10"}`}>
              <Heart className="h-4 w-4" /> Liked <span className="ml-auto text-xs text-white/50">{liked.length}</span>
            </button>
          </nav>

          <div className="h-px bg-white/10" />

          <button onClick={() => setImportOpen(true)} className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-3 py-2.5 text-sm ring-1 ring-white/10 hover:from-pink-500/30 hover:to-purple-500/30">
            <Download className="h-4 w-4" /> Import YouTube playlist
          </button>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
            <input
              value={libQuery} onChange={(e) => setLibQuery(e.target.value)}
              placeholder="Filter library…"
              className="w-full rounded-lg bg-white/5 py-2 pl-8 pr-2 text-xs text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-white/25"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-widest text-white/40">
              <span>Playlists</span>
              <button onClick={openCreate} className="rounded p-1 hover:bg-white/10" aria-label="New playlist"><Plus className="h-3.5 w-3.5" /></button>
            </div>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
              {playlists.filter(pl => pl.name.toLowerCase().includes(libQuery.toLowerCase())).map(pl => (
                <div key={pl.id} className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view===pl.id?"bg-white/15":"hover:bg-white/10"}`}>
                  <button onClick={() => setView(pl.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                    <ListMusic className="h-4 w-4 shrink-0 text-white/70" />
                    <span className="truncate">{pl.name}</span>
                    <span className="ml-auto text-xs text-white/50">{pl.tracks.length}</span>
                  </button>
                  <button onClick={() => deletePlaylist(pl.id)} className="hidden rounded p-1 text-white/50 hover:bg-white/10 hover:text-white group-hover:block" aria-label="Delete"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
              {!playlists.length && <div className="px-3 py-2 text-xs text-white/40">No playlists yet.</div>}
            </div>
          </div>

          {recentPlayed.length > 0 && (
            <div className="flex min-h-0 flex-col gap-2 border-t border-white/10 pt-3">
              <div className="px-1 text-[11px] uppercase tracking-widest text-white/40">Recently played</div>
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                {recentPlayed.map(t => (
                  <button key={t.id} onClick={() => play(t)} className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/10">
                    <img src={t.artwork} alt="" className="h-7 w-7 rounded" />
                    <div className="min-w-0">
                      <div className="truncate text-xs font-medium">{t.title}</div>
                      <div className="truncate text-[10px] text-white/50">{t.artist}</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>

        {/* Main */}
        <main className="min-w-0 flex-1 overflow-y-auto">
          {view === "home" && !current && (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-center">
              <NoteIcon className="h-12 w-12 text-white/40" />
              <h1 className="text-2xl font-bold">Search to start listening</h1>
              <p className="max-w-sm text-sm text-white/60">Songs stream from YouTube via Invidious. Build playlists, like songs, view lyrics — even import full YouTube playlists.</p>
            </div>
          )}

          {(view === "liked" || playlists.some(p => p.id === view)) && (
            <div>
              <div className="mb-4 flex items-end gap-4">
                <div className="grid h-32 w-32 place-items-center rounded-2xl bg-gradient-to-br from-pink-500/50 to-purple-700/50 shadow-xl">
                  {view === "liked" ? <Heart className="h-12 w-12" /> : <ListMusic className="h-12 w-12" />}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/60">Playlist</div>
                  <h1 className="text-3xl font-black md:text-4xl">{view === "liked" ? "Liked Songs" : playlists.find(p=>p.id===view)?.name}</h1>
                  <div className="mt-1 text-sm text-white/60">
                    {activeList.length} songs
                    {activeList.some(t => t.durationMs) && (
                      <> · {fmt(activeList.reduce((s, t) => s + (t.durationMs || 0), 0) / 1000)}</>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button disabled={!activeList.length} onClick={() => play(activeList[0], activeList, 0)} className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-40">
                      <Play className="h-4 w-4 fill-current" /> Play
                    </button>
                    <button disabled={!activeList.length} onClick={shuffle} className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-40">
                      <Shuffle className="h-4 w-4" /> Shuffle
                    </button>
                    {view === "liked" && liked.length > 0 && (
                      <button onClick={clearLiked} className="flex items-center gap-2 rounded-full bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-300 ring-1 ring-rose-400/30 hover:bg-rose-500/25">
                        <Trash2 className="h-4 w-4" /> Clear all
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {activeList.map((t, i) => (
                  <button key={t.id} onClick={() => play(t, activeList, i)} className="group flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10">
                    <span className="w-6 text-right text-xs text-white/50">{i+1}</span>
                    <img src={t.artwork} alt="" className="h-10 w-10 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="truncate text-xs text-white/60">{t.artist}</div>
                    </div>
                    {t.durationMs ? <span className="hidden text-[11px] tabular-nums text-white/40 sm:inline">{fmtMs(t.durationMs)}</span> : null}
                    {view === "liked" ? (
                      <span
                        onClick={(e) => { e.stopPropagation(); toggleLike(t); }}
                        className="rounded p-1.5 text-pink-300 opacity-0 hover:bg-white/10 group-hover:opacity-100"
                        aria-label="Unlike"
                      ><Heart className="h-3.5 w-3.5 fill-current" /></span>
                    ) : (
                      <span
                        onClick={(e) => { e.stopPropagation(); removeFromPlaylist(view, t.id); }}
                        className="rounded p-1.5 text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      ><Trash2 className="h-3.5 w-3.5" /></span>
                    )}
                  </button>
                ))}
                {!activeList.length && <div className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/60">No songs yet. Search above and tap + to add.</div>}
              </div>
            </div>
          )}

          {view === "home" && current && (
            <div className="flex flex-col items-center gap-6 py-4 md:flex-row md:items-start md:gap-10">
              <div className="relative">
                <img
                  ref={artRef}
                  crossOrigin="anonymous"
                  src={current.artworkHi}
                  onLoad={onArtLoad}
                  alt={current.title}
                  className="h-64 w-64 rounded-2xl object-cover shadow-2xl md:h-80 md:w-80"
                />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs uppercase tracking-widest text-white/60">Now Playing</div>
                <h1 className="mt-1 text-3xl font-black md:text-5xl">{current.title}</h1>
                <div className="mt-1 text-lg text-white/70">{current.artist}</div>
                {current.album && <div className="text-sm text-white/50">{current.album}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                  {current.year && <span className="rounded-full bg-white/10 px-2 py-0.5">{current.year}</span>}
                  {current.genre && <span className="rounded-full bg-white/10 px-2 py-0.5">{current.genre}</span>}
                  {current.durationMs && <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5"><Clock className="h-3 w-3" />{fmtMs(current.durationMs)}</span>}
                  {current.trackUrl && (
                    <a href={current.trackUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/15">
                      <ExternalLink className="h-3 w-3" /> iTunes
                    </a>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button onClick={() => toggleLike(current)} className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ${isLiked(current) ? "bg-pink-500/20 text-pink-300 ring-pink-400/40" : "bg-white/10 ring-white/20 hover:bg-white/15"}`}>
                    <Heart className={`h-4 w-4 ${isLiked(current)?"fill-current":""}`} /> {isLiked(current) ? "Liked" : "Like"}
                  </button>
                  <button onClick={() => setPickerFor(current)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/15">
                    <Plus className="h-4 w-4" /> Add to playlist
                  </button>
                  <button onClick={() => setShowLyrics(s => !s)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/15">
                    {showLyrics ? "Hide lyrics" : "Show lyrics"}
                  </button>
                  <button
                    onClick={async () => {
                      const more = await searchITunes(current.artist, 25);
                      const others = more.filter(t => t.id !== current.id);
                      if (!others.length) return;
                      const shuffled = others.sort(() => Math.random() - 0.5);
                      play(shuffled[0], shuffled, 0);
                    }}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/15"
                    title={`Radio based on ${current.artist}`}
                  >
                    <Shuffle className="h-4 w-4" /> Artist radio
                  </button>
                  <button
                    onClick={() => { setQuery(current.artist); setShowSearch(true); searchInputRef.current?.focus(); }}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/15"
                  >
                    <Search className="h-4 w-4" /> More by artist
                  </button>
                </div>
                {showLyrics && (
                  <div className="mt-5 max-h-[45vh] overflow-y-auto rounded-2xl bg-black/50 p-6 ring-1 ring-white/10 backdrop-blur scrollbar-thin">
                    {lyrics === null ? (
                      <div className="flex items-center justify-center gap-2 py-6 text-sm text-white/50">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading lyrics…
                      </div>
                    ) : lyrics.trim().length === 0 ? (
                      <div className="py-6 text-center text-sm text-white/50">No lyrics found for this track.</div>
                    ) : (
                      <div className="flex flex-col gap-1.5 text-center text-[15px] leading-relaxed text-white/90">
                        {lyrics.split("\n").map((line, i) => (
                          <p key={i} className={line.trim() === "" ? "h-3" : "transition hover:text-white"}>
                            {line || "\u00A0"}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                {queue.length > 1 && (
                  <div className="mt-5">
                    <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-white/50">
                      <ListOrdered className="h-3.5 w-3.5" /> Up next
                    </div>
                    <div className="flex flex-col gap-1">
                      {queue.slice(queueIdx + 1, queueIdx + 6).map((t, i) => (
                        <button key={t.id} onClick={() => play(t, queue, queueIdx + 1 + i)} className="flex items-center gap-3 rounded-lg p-1.5 text-left hover:bg-white/10">
                          <img src={t.artwork} alt="" className="h-8 w-8 rounded" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">{t.title}</div>
                            <div className="truncate text-[11px] text-white/55">{t.artist}</div>
                          </div>
                          {t.durationMs && <span className="text-[10px] tabular-nums text-white/40">{fmtMs(t.durationMs)}</span>}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      {/* Player bar */}
      <footer className="fixed inset-x-2 bottom-20 z-30 rounded-2xl border border-white/10 bg-black/75 shadow-2xl backdrop-blur-xl md:inset-x-4 md:bottom-24">
        <div className="mx-auto flex max-w-7xl items-center gap-3 px-3 py-2.5 md:gap-5 md:px-5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            {current ? (
              <>
                <img src={current.artwork} alt="" className="h-12 w-12 rounded-lg" />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold">{current.title}</div>
                  <div className="truncate text-xs text-white/60">{current.artist}</div>
                </div>
                <button onClick={() => toggleLike(current)} className="ml-1 hidden rounded-full p-2 hover:bg-white/10 sm:block">
                  <Heart className={`h-4 w-4 ${isLiked(current)?"fill-pink-400 text-pink-400":"text-white/70"}`} />
                </button>
              </>
            ) : <div className="text-sm text-white/50">Nothing playing</div>}
          </div>

          <div className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex items-center gap-2">
              <button onClick={prev} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"><SkipBack className="h-4 w-4" /></button>
              <button onClick={toggle} className="grid h-10 w-10 place-items-center rounded-full bg-white text-black hover:scale-105 transition">
                {playing ? <Pause className="h-4 w-4 fill-current" /> : <Play className="h-4 w-4 fill-current" />}
              </button>
              <button onClick={next} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white"><SkipForward className="h-4 w-4" /></button>
              <button onClick={() => setRepeat(r => !r)} className={`rounded-full p-2 hover:bg-white/10 ${repeat?"text-primary":"text-white/60"}`}><Repeat className="h-4 w-4" /></button>
            </div>
            <div className="flex w-full max-w-xl items-center gap-2 text-[11px] text-white/60">
              <span className="w-9 text-right tabular-nums">{fmt(progress)}</span>
              <div
                className="group h-1.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-white/15"
                onClick={(e) => {
                  const r = e.currentTarget.getBoundingClientRect();
                  seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)));
                }}
              >
                <div className="h-full bg-white transition-[width]" style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }} />
              </div>
              <span className="w-9 tabular-nums">{fmt(duration)}</span>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
            <button onClick={() => setMuted(m => !m)} className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white">
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range" min={0} max={100} value={muted ? 0 : volume}
              onChange={(e) => { setMuted(false); setVolume(Number(e.target.value)); }}
              className="h-1 w-24 cursor-pointer accent-white"
              aria-label="Volume"
            />
          </div>
        </div>
      </footer>

      {/* Add-to-playlist picker */}
      {pickerFor && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={() => setPickerFor(null)}>
          <div className="w-full max-w-sm overflow-hidden rounded-2xl bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Add to playlist</h3>
                <p className="mt-0.5 truncate text-xs text-white/55">{pickerFor.title} — {pickerFor.artist}</p>
              </div>
              <button onClick={() => setPickerFor(null)} className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-3">
              <button onClick={() => { setPickerCreateMode(true); openCreate(); }} className="mb-2 flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-3 py-2.5 text-sm font-medium ring-1 ring-white/10 hover:from-pink-500/30 hover:to-purple-500/30">
                <Plus className="h-4 w-4" /> New playlist
              </button>
              <div className="max-h-64 overflow-y-auto">
                {playlists.map(pl => (
                  <button key={pl.id} onClick={() => addToPlaylist(pl.id, pickerFor!)} className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-white/10">
                    <ListMusic className="h-4 w-4 text-white/70" />
                    <span className="truncate">{pl.name}</span>
                    <span className="ml-auto text-xs text-white/50">{pl.tracks.length}</span>
                  </button>
                ))}
                {!playlists.length && <div className="px-3 py-6 text-center text-xs text-white/50">No playlists yet. Create one above.</div>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create playlist */}
      {createOpen && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={() => setCreateOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold">New playlist</h3>
                <p className="mt-0.5 text-xs text-white/55">Give it a name. You can add songs anytime.</p>
              </div>
              <button onClick={() => setCreateOpen(false)} className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/45">Name</label>
              <input
                autoFocus
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && newPlName.trim()) submitCreate(); }}
                placeholder="My Vibes"
                className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/40 focus:bg-white/15 focus:ring-white/30"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button onClick={() => setCreateOpen(false)} className="rounded-lg px-3.5 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={submitCreate} disabled={!newPlName.trim()} className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50">
                <Plus className="h-3.5 w-3.5" /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import YouTube playlist */}
      {importOpen && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150" onClick={() => !importing && setImportOpen(false)}>
          <div className="w-full max-w-md overflow-hidden rounded-2xl bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-150" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold">Import YouTube playlist</h3>
                <p className="mt-0.5 text-xs text-white/55">Paste a playlist URL or ID. Fetched via Invidious — no account needed.</p>
              </div>
              <button onClick={() => !importing && setImportOpen(false)} className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"><X className="h-4 w-4" /></button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/45">Playlist URL</label>
              <input
                autoFocus
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleImport(); }}
                placeholder="https://youtube.com/playlist?list=…"
                className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/40 focus:bg-white/15 focus:ring-white/30"
              />
              {importError && <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/20">{importError}</div>}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button onClick={() => setImportOpen(false)} disabled={importing} className="rounded-lg px-3.5 py-2 text-sm text-white/70 hover:bg-white/10">Cancel</button>
              <button onClick={handleImport} disabled={importing || !importUrl.trim()} className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50">
                {importing ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…</> : <><Download className="h-3.5 w-3.5" /> Import</>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}