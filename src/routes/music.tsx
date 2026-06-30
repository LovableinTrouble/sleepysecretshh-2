import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import {
  Search,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Volume2,
  VolumeX,
  Repeat,
  Heart,
  Plus,
  ListMusic,
  Trash2,
  X,
  Shuffle,
  Clock,
  ExternalLink,
  ListOrdered,
  Download,
  Loader as Loader2,
} from "lucide-react";

// Clean custom music note glyph used in the header
function NoteIcon({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" aria-hidden="true">
      <path
        d="M9 18V6.2a1 1 0 0 1 .8-.98l8-1.6A1 1 0 0 1 19 4.6V16"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6.5" cy="18" r="2.5" fill="currentColor" />
      <circle cx="16.5" cy="16" r="2.5" fill="currentColor" />
    </svg>
  );
}
import {
  searchITunes,
  fetchLyrics,
  loadPlaylists,
  savePlaylists,
  loadLiked,
  saveLiked,
  loadRecent,
  pushRecent,
  clearRecent,
  importInvidiousPlaylist,
  type Track,
  type Playlist,
} from "@/lib/music";
import {
  useMusicPlayer,
  play as globalPlay,
  toggle as globalToggle,
  next as globalNext,
  prev as globalPrev,
  seek as globalSeek,
  setVolume as globalSetVolume,
  setMuted as globalSetMuted,
  setRepeat as globalSetRepeat,
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
  const sec = Math.floor(s % 60)
    .toString()
    .padStart(2, "0");
  return `${m}:${sec}`;
}

function fmtMs(ms?: number) {
  if (!ms) return "";
  return fmt(ms / 1000);
}

const TRENDING = ["Taylor Swift", "The Weeknd", "Drake", "Billie Eilish", "Kendrick Lamar", "SZA"];

const GENRES: { name: string; query: string; gradient: string }[] = [
  { name: "Pop", query: "pop hits", gradient: "from-pink-500 to-rose-600" },
  { name: "Hip-Hop", query: "hip hop", gradient: "from-amber-500 to-orange-700" },
  { name: "R&B", query: "rnb soul", gradient: "from-purple-500 to-fuchsia-700" },
  { name: "Rock", query: "rock", gradient: "from-red-500 to-zinc-800" },
  { name: "Electronic", query: "electronic dance", gradient: "from-cyan-400 to-blue-700" },
  { name: "Indie", query: "indie", gradient: "from-emerald-400 to-teal-700" },
  { name: "Country", query: "country", gradient: "from-yellow-500 to-amber-800" },
  { name: "K-Pop", query: "kpop", gradient: "from-pink-400 to-violet-600" },
  { name: "Latin", query: "latin reggaeton", gradient: "from-orange-400 to-red-700" },
  { name: "Jazz", query: "jazz", gradient: "from-blue-400 to-indigo-800" },
  { name: "Classical", query: "classical orchestra", gradient: "from-slate-400 to-zinc-700" },
  { name: "Lo-fi", query: "lofi chill beats", gradient: "from-violet-400 to-indigo-700" },
];

function MusicPage() {
  const player = useMusicPlayer();
  const { current, queue, queueIdx, playing, progress, duration, volume, muted, repeat, loading } = player;

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Track[]>([]);
  const [searching, setSearching] = useState(false);
  const [showSearch, setShowSearch] = useState(false);

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [showLyrics, setShowLyrics] = useState(false);

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [liked, setLiked] = useState<Track[]>([]);
  const [view, setView] = useState<"home" | "liked" | string>("home"); // string = playlist id
  const [pickerFor, setPickerFor] = useState<Track | null>(null);
  const [recent, setRecent] = useState<string[]>([]);
  const [libQuery, setLibQuery] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [recentPlayed, setRecentPlayed] = useState<Track[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newPlName, setNewPlName] = useState("");
  const [pickerCreateMode, setPickerCreateMode] = useState(false);

  // dynamic list for artist:/genre: views
  const [dynList, setDynList] = useState<Track[]>([]);
  const [dynLoading, setDynLoading] = useState(false);

  const searchWrapperRef = useRef<HTMLDivElement>(null);
  const searchPanelRef = useRef<HTMLDivElement>(null);
  const [searchPanelStyle, setSearchPanelStyle] = useState<CSSProperties>({
    left: 12,
    top: 92,
    width: "calc(100vw - 24px)",
  });
  const [bg, setBg] = useState<[number, number, number]>([40, 40, 60]);
  const artRef = useRef<HTMLImageElement>(null);

  const positionSearchPanel = useCallback(() => {
    const el = searchWrapperRef.current;
    if (!el || typeof window === "undefined") return;

    const rect = el.getBoundingClientRect();
    const pad = 12;
    const visualViewport = window.visualViewport;
    const viewportWidth = visualViewport?.width ?? window.innerWidth;
    const viewportHeight = visualViewport?.height ?? window.innerHeight;
    const viewportTop = visualViewport?.offsetTop ?? 0;
    const isMobile = viewportWidth < 768;
    const panelWidth = isMobile
      ? Math.max(280, viewportWidth - pad * 2)
      : Math.min(rect.width, viewportWidth - pad * 2);
    const left = isMobile ? pad : Math.max(pad, Math.min(rect.left, viewportWidth - panelWidth - pad));
    const top = Math.max(
      pad + viewportTop,
      Math.min(rect.bottom + 8 + viewportTop, viewportTop + viewportHeight - 180),
    );

    setSearchPanelStyle({ left, top, width: panelWidth });
  }, []);

  useEffect(() => {
    setPlaylists(loadPlaylists());
    setLiked(loadLiked());
    setRecent(loadRecent());
  }, []);

  useEffect(() => {
    try {
      setRecentPlayed(JSON.parse(localStorage.getItem("sleepy.music.recentplayed.v1") || "[]"));
    } catch {}
  }, []);

  // load tracks for artist:/genre: views
  useEffect(() => {
    if (typeof view !== "string") return;
    if (!view.startsWith("artist:") && !view.startsWith("genre:")) return;
    const q = view.startsWith("artist:") ? view.slice(7) : view.slice(6);
    let cancelled = false;
    setDynLoading(true);
    setDynList([]);
    searchITunes(q, 25)
      .then((rs) => {
        if (!cancelled) setDynList(rs);
      })
      .finally(() => {
        if (!cancelled) setDynLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [view]);

  // suggested artists derived from liked + recently played
  const suggestedArtists = useMemo(() => {
    const counts = new Map<string, { name: string; art: string; n: number }>();
    for (const t of [...liked, ...recentPlayed]) {
      if (!t.artist) continue;
      const k = t.artist.toLowerCase();
      const cur = counts.get(k);
      if (cur) cur.n++;
      else counts.set(k, { name: t.artist, art: t.artworkHi || t.artwork, n: 1 });
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 8);
  }, [liked, recentPlayed]);

  async function handleImport() {
    setImporting(true);
    setImportError(null);
    try {
      const res = await importInvidiousPlaylist(importUrl);
      if (!res || !res.tracks.length) {
        setImportError("Couldn't load that playlist. Check the link.");
        return;
      }
      const np: Playlist = { id: crypto.randomUUID(), name: res.name, tracks: res.tracks, createdAt: Date.now() };
      const next = [np, ...playlists];
      setPlaylists(next);
      savePlaylists(next);
      setView(np.id);
      setImportOpen(false);
      setImportUrl("");
    } catch {
      setImportError("Import failed. Try a different playlist.");
    } finally {
      setImporting(false);
    }
  }

  // keyboard: space=play/pause, / focus search
  const searchInputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "/") {
        e.preventDefault();
        searchInputRef.current?.focus();
      } else if (e.code === "Space") {
        e.preventDefault();
        globalToggle();
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, []);

  // hide search results when clicking outside
  useEffect(() => {
    let enabled = false;
    const timer = setTimeout(() => {
      enabled = true;
    }, 150);
    const onDown = (e: PointerEvent) => {
      if (!enabled) return;
      if (!searchWrapperRef.current) return;
      const target = e.target as Node;
      if (!searchWrapperRef.current.contains(target) && !searchPanelRef.current?.contains(target)) {
        setShowSearch(false);
      }
    };
    window.addEventListener("pointerdown", onDown);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("pointerdown", onDown);
    };
  }, [showSearch]);

  useEffect(() => {
    if (!showSearch) return;
    positionSearchPanel();
    const onMove = () => positionSearchPanel();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    window.visualViewport?.addEventListener("resize", onMove);
    window.visualViewport?.addEventListener("scroll", onMove);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
      window.visualViewport?.removeEventListener("resize", onMove);
      window.visualViewport?.removeEventListener("scroll", onMove);
    };
  }, [positionSearchPanel, showSearch]);

  // search (debounced)
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const t = setTimeout(async () => {
      try {
        setResults(await searchITunes(q));
      } finally {
        setSearching(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [query]);

  // play wrapper that integrates with global player and local UI state
  const play = useCallback(async (t: Track, list?: Track[], idx?: number) => {
    setLyrics(null);
    setShowLyrics(false);
    setShowSearch(false);
    setQuery(t.title);
    setRecentPlayed((prev) => {
      const next = [t, ...prev.filter((x) => x.id !== t.id)].slice(0, 12);
      try {
        localStorage.setItem("sleepy.music.recentplayed.v1", JSON.stringify(next));
      } catch {}
      return next;
    });
    await globalPlay(t, list, idx);
    fetchLyrics(t.artist, t.title).then(setLyrics);
  }, []);

  const next = useCallback(() => {
    globalNext();
  }, []);

  const prev = useCallback(() => {
    globalPrev();
  }, []);

  const toggle = useCallback(() => {
    globalToggle();
  }, []);

  const seek = useCallback((pct: number) => {
    globalSeek(pct);
  }, []);

  // ambient color from album art
  const onArtLoad = () => {
    const img = artRef.current;
    if (!img) return;
    try {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      const ctx = c.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, 16, 16);
      const d = ctx.getImageData(0, 0, 16, 16).data;
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let i = 0; i < d.length; i += 4) {
        r += d[i];
        g += d[i + 1];
        b += d[i + 2];
        n++;
      }
      setBg([Math.round(r / n), Math.round(g / n), Math.round(b / n)]);
    } catch {}
  };

  // playlists
  const createPlaylist = (name?: string): Playlist | null => {
    const n = (name ?? "").trim();
    if (!n) return null;
    const np: Playlist = { id: crypto.randomUUID(), name: n, tracks: [], createdAt: Date.now() };
    const next = [np, ...playlists];
    setPlaylists(next);
    savePlaylists(next);
    return np;
  };
  const openCreate = () => {
    setNewPlName("");
    setCreateOpen(true);
  };
  const submitCreate = () => {
    const np = createPlaylist(newPlName);
    if (!np) return;
    setCreateOpen(false);
    if (pickerFor) {
      addToPlaylist(np.id, pickerFor);
    }
    setPickerCreateMode(false);
  };
  const deletePlaylist = (id: string) => {
    const next = playlists.filter((p) => p.id !== id);
    setPlaylists(next);
    savePlaylists(next);
    if (view === id) setView("home");
  };
  const addToPlaylist = (plId: string, t: Track) => {
    const next = playlists.map((p) =>
      p.id === plId ? { ...p, tracks: p.tracks.some((x) => x.id === t.id) ? p.tracks : [...p.tracks, t] } : p,
    );
    setPlaylists(next);
    savePlaylists(next);
    setPickerFor(null);
  };
  const removeFromPlaylist = (plId: string, tid: string) => {
    const next = playlists.map((p) => (p.id === plId ? { ...p, tracks: p.tracks.filter((t) => t.id !== tid) } : p));
    setPlaylists(next);
    savePlaylists(next);
  };
  const toggleLike = (t: Track) => {
    if (!t || !t.id) return;
    const has = liked.some((x) => x.id === t.id);
    const next = has ? liked.filter((x) => x.id !== t.id) : [t, ...liked.filter((x) => x.id !== t.id)];
    setLiked(next);
    saveLiked(next);
  };
  const clearLiked = () => {
    setLiked([]);
    saveLiked([]);
  };
  const isLiked = (t?: Track | null) => !!t && liked.some((x) => x.id === t.id);

  const activeList: Track[] = useMemo(() => {
    if (view === "liked") return liked;
    if (typeof view === "string" && (view.startsWith("artist:") || view.startsWith("genre:"))) return dynList;
    const pl = playlists.find((p) => p.id === view);
    return pl?.tracks || [];
  }, [view, liked, playlists, dynList]);

  const shuffle = () => {
    if (!activeList.length) return;
    const sh = [...activeList].sort(() => Math.random() - 0.5);
    play(sh[0], sh, 0);
  };

  const [r, g, b] = bg;
  const grad = `radial-gradient(1200px 800px at 20% 0%, rgba(${r},${g},${b},0.55), transparent 60%), radial-gradient(900px 700px at 100% 100%, rgba(${Math.max(0, r - 30)},${Math.max(0, g - 30)},${Math.max(0, b - 30)},0.55), transparent 60%), #0a0a0f`;

  return (
    <div
      className="fixed inset-0 z-30 flex flex-col text-foreground transition-[background] duration-700 overflow-hidden"
      style={{ background: grad }}
    >
      {/* Top bar */}
      <header className="flex flex-col gap-2 px-4 py-3 md:grid md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center md:gap-3 md:px-6">
        <div className="flex items-center gap-2 text-lg font-bold tracking-tight">
          <NoteIcon className="h-5 w-5 text-white/90" /> Music
        </div>
        <div ref={searchWrapperRef} className="relative w-full md:mx-auto md:max-w-xl md:justify-self-center">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/60" />
          <input
            ref={searchInputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShowSearch(true);
              requestAnimationFrame(positionSearchPanel);
            }}
            onFocus={() => {
              setShowSearch(true);
              requestAnimationFrame(positionSearchPanel);
            }}
            placeholder="Search songs, artists, albums…"
            className="w-full rounded-full bg-white/10 py-2.5 pl-10 pr-16 text-sm text-white placeholder:text-white/50 outline-none ring-1 ring-white/10 backdrop-blur focus:bg-white/15 focus:ring-white/30"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery("");
                setResults([]);
                searchInputRef.current?.focus();
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-white/60 hover:bg-white/10 hover:text-white"
              aria-label="Clear"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-white/15 bg-white/5 px-1.5 py-0.5 text-[10px] text-white/50">
              /
            </kbd>
          )}
        </div>
        <div />
      </header>

      {showSearch &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={searchPanelRef}
            style={searchPanelStyle}
            className="fixed z-[120] max-h-[min(62vh,520px)] overflow-y-auto rounded-2xl bg-black/90 p-2 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur-xl overscroll-contain"
          >
            {searching && <div className="p-3 text-sm text-white/60">Searching…</div>}
            {!searching && !results.length && (
              <div className="p-2">
                {recent.length > 0 && (
                  <div className="mb-2">
                    <div className="mb-1 flex items-center justify-between px-2 text-[11px] uppercase tracking-widest text-white/40">
                      <span>Recent</span>
                      <button
                        onClick={() => {
                          clearRecent();
                          setRecent([]);
                        }}
                        className="text-white/40 hover:text-white"
                      >
                        Clear
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5 px-1">
                      {recent.map((r) => (
                        <button
                          key={r}
                          onClick={() => setQuery(r)}
                          className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15"
                        >
                          {r}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                <div className="mb-1 px-2 text-[11px] uppercase tracking-widest text-white/40">Trending</div>
                <div className="flex flex-wrap gap-1.5 px-1">
                  {TRENDING.map((r) => (
                    <button
                      key={r}
                      onClick={() => setQuery(r)}
                      className="rounded-full bg-white/10 px-3 py-1 text-xs hover:bg-white/15"
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {results.map((t, i) => (
              <button
                key={t.id}
                onClick={() => play(t, results, i)}
                className="flex w-full min-w-0 items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10 active:bg-white/15"
              >
                <img src={t.artwork} alt="" className="h-10 w-10 shrink-0 rounded-md object-cover" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">{t.title}</div>
                  <div className="truncate text-xs text-white/60">
                    {t.artist}
                    {t.year ? <span className="text-white/40"> · {t.year}</span> : null}
                    {t.genre ? <span className="text-white/40"> · {t.genre}</span> : null}
                  </div>
                </div>
                {t.durationMs ? (
                  <span className="hidden text-[11px] tabular-nums text-white/50 sm:inline">{fmtMs(t.durationMs)}</span>
                ) : null}
                <Plus
                  className="h-9 w-9 shrink-0 rounded-full p-2 text-white/60 hover:bg-white/10 hover:text-white"
                  onClick={(e) => {
                    e.stopPropagation();
                    setPickerFor(t);
                  }}
                />
              </button>
            ))}
          </div>,
          document.body,
        )}

      {/* Body */}
      <div className="flex min-h-0 flex-1 gap-4 px-4 pb-48 md:px-6 md:pb-52">
        {/* Sidebar */}
        <aside className="hidden w-64 shrink-0 flex-col gap-4 rounded-2xl bg-black/30 p-4 ring-1 ring-white/10 backdrop-blur md:flex">
          <nav className="flex flex-col gap-1.5">
            <button
              onClick={() => setView("home")}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${view === "home" ? "bg-white/15 font-semibold" : "hover:bg-white/10"}`}
            >
              <NoteIcon className="h-4 w-4" /> Home
            </button>
            <button
              onClick={() => setView("liked")}
              className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm ${view === "liked" ? "bg-white/15 font-semibold" : "hover:bg-white/10"}`}
            >
              <Heart className="h-4 w-4" /> Liked <span className="ml-auto text-xs text-white/50">{liked.length}</span>
            </button>
          </nav>

          <div className="h-px bg-white/10" />

          <button
            onClick={() => setImportOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-3 py-2.5 text-sm ring-1 ring-white/10 hover:from-pink-500/30 hover:to-purple-500/30"
          >
            <Download className="h-4 w-4" /> Import YouTube playlist
          </button>

          <div className="flex flex-col gap-2">
            <div className="px-1 text-[11px] uppercase tracking-widest text-white/40">Browse genres</div>
            <div className="flex flex-wrap gap-1.5">
              {GENRES.slice(0, 8).map((g) => (
                <button
                  key={g.name}
                  onClick={() => setView(`genre:${g.query}`)}
                  className={`rounded-full bg-gradient-to-r ${g.gradient} px-2.5 py-1 text-[11px] font-semibold text-white/95 shadow-sm ring-1 ring-white/10 hover:brightness-110`}
                >
                  {g.name}
                </button>
              ))}
            </div>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/50" />
            <input
              value={libQuery}
              onChange={(e) => setLibQuery(e.target.value)}
              placeholder="Filter library…"
              className="w-full rounded-lg bg-white/5 py-2 pl-8 pr-2 text-xs text-white placeholder:text-white/40 outline-none ring-1 ring-white/10 focus:ring-white/25"
            />
          </div>

          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 text-[11px] uppercase tracking-widest text-white/40">
              <span>Playlists</span>
              <button onClick={openCreate} className="rounded p-1 hover:bg-white/10" aria-label="New playlist">
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
              {playlists
                .filter((pl) => pl.name.toLowerCase().includes(libQuery.toLowerCase()))
                .map((pl) => (
                  <div
                    key={pl.id}
                    className={`group flex items-center gap-2 rounded-lg px-3 py-2 text-sm ${view === pl.id ? "bg-white/15" : "hover:bg-white/10"}`}
                  >
                    <button onClick={() => setView(pl.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                      <ListMusic className="h-4 w-4 shrink-0 text-white/70" />
                      <span className="truncate">{pl.name}</span>
                      <span className="ml-auto text-xs text-white/50">{pl.tracks.length}</span>
                    </button>
                    <button
                      onClick={() => deletePlaylist(pl.id)}
                      className="hidden rounded p-1 text-white/50 hover:bg-white/10 hover:text-white group-hover:block"
                      aria-label="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              {!playlists.length && <div className="px-3 py-2 text-xs text-white/40">No playlists yet.</div>}
            </div>
          </div>

          {recentPlayed.length > 0 && (
            <div className="flex min-h-0 flex-col gap-2 border-t border-white/10 pt-3">
              <div className="px-1 text-[11px] uppercase tracking-widest text-white/40">Recently played</div>
              <div className="flex max-h-56 flex-col gap-1 overflow-y-auto pr-1">
                {recentPlayed.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => play(t)}
                    className="flex items-center gap-2.5 rounded-lg px-2 py-2 text-left hover:bg-white/10"
                  >
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
            <div className="flex flex-col gap-8 pb-6">
              {/* Hero */}
              <div className="rounded-3xl bg-gradient-to-br from-pink-500/20 via-purple-600/15 to-indigo-700/20 p-6 ring-1 ring-white/10 md:p-8">
                <div className="text-[11px] uppercase tracking-widest text-white/60">Welcome back</div>
                <h1 className="mt-1 text-2xl font-black md:text-4xl">What do you want to hear today?</h1>
                <p className="mt-1 max-w-xl text-sm text-white/65">
                  Search, browse genres, dive into an artist, or pick up a playlist.
                </p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {TRENDING.slice(0, 6).map((q) => (
                    <button
                      key={q}
                      onClick={() => setView(`artist:${q}`)}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-medium ring-1 ring-white/15 hover:bg-white/20"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </div>

              {/* Jump back in */}
              {recentPlayed.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-bold">Jump back in</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                    {recentPlayed.slice(0, 12).map((t) => (
                      <button
                        key={t.id}
                        onClick={() => play(t, recentPlayed, recentPlayed.indexOf(t))}
                        className="group flex flex-col gap-2 rounded-xl bg-white/5 p-2.5 text-left ring-1 ring-white/5 hover:bg-white/10"
                      >
                        <img src={t.artworkHi || t.artwork} alt="" className="aspect-square w-full rounded-lg object-cover" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{t.title}</div>
                          <div className="truncate text-xs text-white/60">{t.artist}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Made for you - suggested artists */}
              {suggestedArtists.length > 0 && (
                <section>
                  <h2 className="mb-3 text-lg font-bold">Made for you</h2>
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                    {suggestedArtists.map((a) => (
                      <button
                        key={a.name}
                        onClick={() => setView(`artist:${a.name}`)}
                        className="group flex items-center gap-3 rounded-xl bg-white/5 p-2.5 text-left ring-1 ring-white/5 hover:bg-white/10"
                      >
                        <img src={a.art} alt="" className="h-14 w-14 rounded-full object-cover ring-1 ring-white/10" />
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold">{a.name}</div>
                          <div className="text-[11px] text-white/55">Artist radio</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Browse genres */}
              <section>
                <h2 className="mb-3 text-lg font-bold">Browse all</h2>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {GENRES.map((g) => (
                    <button
                      key={g.name}
                      onClick={() => setView(`genre:${g.query}`)}
                      className={`relative h-24 overflow-hidden rounded-2xl bg-gradient-to-br ${g.gradient} p-3 text-left shadow-lg ring-1 ring-white/10 transition hover:brightness-110 active:scale-[0.98]`}
                    >
                      <div className="text-base font-black text-white drop-shadow">{g.name}</div>
                    </button>
                  ))}
                </div>
              </section>

              {/* Trending */}
              <section>
                <h2 className="mb-3 text-lg font-bold">Trending artists</h2>
                <div className="flex flex-wrap gap-2">
                  {TRENDING.map((q) => (
                    <button
                      key={q}
                      onClick={() => setView(`artist:${q}`)}
                      className="rounded-full bg-white/10 px-3 py-1.5 text-sm font-medium ring-1 ring-white/15 hover:bg-white/20"
                    >
                      {q}
                    </button>
                  ))}
                </div>
              </section>
            </div>
          )}

          {(view === "liked" ||
            playlists.some((p) => p.id === view) ||
            (typeof view === "string" && (view.startsWith("artist:") || view.startsWith("genre:")))) && (
            <div>
              <div className="mb-4 flex items-end gap-4">
                <div className="grid h-32 w-32 place-items-center overflow-hidden rounded-2xl bg-gradient-to-br from-pink-500/50 to-purple-700/50 shadow-xl">
                  {typeof view === "string" && (view.startsWith("artist:") || view.startsWith("genre:")) ? (
                    dynList[0]?.artworkHi ? (
                      <img src={dynList[0].artworkHi} alt="" className="h-full w-full object-cover" />
                    ) : view.startsWith("artist:") ? (
                      <NoteIcon className="h-12 w-12" />
                    ) : (
                      <ListMusic className="h-12 w-12" />
                    )
                  ) : view === "liked" ? (
                    <Heart className="h-12 w-12" />
                  ) : (
                    <ListMusic className="h-12 w-12" />
                  )}
                </div>
                <div>
                  <div className="text-xs uppercase tracking-widest text-white/60">
                    {typeof view === "string" && view.startsWith("artist:")
                      ? "Artist"
                      : typeof view === "string" && view.startsWith("genre:")
                        ? "Genre"
                        : "Playlist"}
                  </div>
                  <h1 className="text-3xl font-black md:text-4xl">
                    {typeof view === "string" && view.startsWith("artist:")
                      ? view.slice(7)
                      : typeof view === "string" && view.startsWith("genre:")
                        ? GENRES.find((g) => g.query === view.slice(6))?.name || view.slice(6)
                        : view === "liked"
                          ? "Liked Songs"
                          : playlists.find((p) => p.id === view)?.name}
                  </h1>
                  <div className="mt-1 text-sm text-white/60">
                    {dynLoading ? "Loading…" : `${activeList.length} songs`}
                    {activeList.some((t) => t.durationMs) && (
                      <> · {fmt(activeList.reduce((s, t) => s + (t.durationMs || 0), 0) / 1000)}</>
                    )}
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button
                      disabled={!activeList.length}
                      onClick={() => play(activeList[0], activeList, 0)}
                      className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-sm font-bold text-black disabled:opacity-40"
                    >
                      <Play className="h-4 w-4 fill-current" /> Play
                    </button>
                    <button
                      disabled={!activeList.length}
                      onClick={shuffle}
                      className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm font-semibold ring-1 ring-white/20 hover:bg-white/15 disabled:opacity-40"
                    >
                      <Shuffle className="h-4 w-4" /> Shuffle
                    </button>
                    {view === "liked" && liked.length > 0 && (
                      <button
                        onClick={clearLiked}
                        className="flex items-center gap-2 rounded-full bg-rose-500/15 px-4 py-2 text-sm font-semibold text-rose-300 ring-1 ring-rose-400/30 hover:bg-rose-500/25"
                      >
                        <Trash2 className="h-4 w-4" /> Clear all
                      </button>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-1">
                {activeList.map((t, i) => (
                  <button
                    key={t.id}
                    onClick={() => play(t, activeList, i)}
                    className="group flex items-center gap-3 rounded-xl p-2 text-left hover:bg-white/10"
                  >
                    <span className="w-6 text-right text-xs text-white/50">{i + 1}</span>
                    <img src={t.artwork} alt="" className="h-10 w-10 rounded-md" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.title}</div>
                      <div className="truncate text-xs text-white/60">{t.artist}</div>
                    </div>
                    {t.durationMs ? (
                      <span className="hidden text-[11px] tabular-nums text-white/40 sm:inline">
                        {fmtMs(t.durationMs)}
                      </span>
                    ) : null}
                    {typeof view === "string" && (view.startsWith("artist:") || view.startsWith("genre:")) ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          setPickerFor(t);
                        }}
                        className="rounded p-1.5 text-white/60 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                        aria-label="Add to playlist"
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </span>
                    ) : view === "liked" ? (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleLike(t);
                        }}
                        className="rounded p-1.5 text-pink-300 opacity-0 hover:bg-white/10 group-hover:opacity-100"
                        aria-label="Unlike"
                      >
                        <Heart className="h-3.5 w-3.5 fill-current" />
                      </span>
                    ) : (
                      <span
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromPlaylist(view, t.id);
                        }}
                        className="rounded p-1.5 text-white/50 opacity-0 hover:bg-white/10 hover:text-white group-hover:opacity-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </button>
                ))}
                {!activeList.length && !dynLoading && (
                  <div className="rounded-xl bg-white/5 p-6 text-center text-sm text-white/60">
                    {typeof view === "string" && (view.startsWith("artist:") || view.startsWith("genre:"))
                      ? "No results — try a different search."
                      : "No songs yet. Search above and tap + to add."}
                  </div>
                )}
                {dynLoading && (
                  <div className="grid place-items-center rounded-xl bg-white/5 p-6 text-sm text-white/60">
                    <Loader2 className="h-5 w-5 animate-spin" />
                  </div>
                )}
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
                <button
                  onClick={() => current && setView(`artist:${current.artist}`)}
                  className="mt-1 text-left text-lg text-white/70 hover:text-white hover:underline"
                >
                  {current.artist}
                </button>
                {current.album && <div className="text-sm text-white/50">{current.album}</div>}
                <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-white/60">
                  {current.year && <span className="rounded-full bg-white/10 px-2 py-0.5">{current.year}</span>}
                  {current.genre && <span className="rounded-full bg-white/10 px-2 py-0.5">{current.genre}</span>}
                  {current.durationMs && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5">
                      <Clock className="h-3 w-3" />
                      {fmtMs(current.durationMs)}
                    </span>
                  )}
                  {current.trackUrl && (
                    <a
                      href={current.trackUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 hover:bg-white/15"
                    >
                      <ExternalLink className="h-3 w-3" /> iTunes
                    </a>
                  )}
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    onClick={() => toggleLike(current)}
                    className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm ring-1 ${isLiked(current) ? "bg-pink-500/20 text-pink-300 ring-pink-400/40" : "bg-white/10 ring-white/20 hover:bg-white/15"}`}
                  >
                    <Heart className={`h-4 w-4 ${isLiked(current) ? "fill-current" : ""}`} />{" "}
                    {isLiked(current) ? "Liked" : "Like"}
                  </button>
                  <button
                    onClick={() => setPickerFor(current)}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/15"
                  >
                    <Plus className="h-4 w-4" /> Add to playlist
                  </button>
                  <button
                    onClick={() => setShowLyrics((s) => !s)}
                    className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-sm ring-1 ring-white/20 hover:bg-white/15"
                  >
                    {showLyrics ? "Hide lyrics" : "Show lyrics"}
                  </button>
                  <button
                    onClick={async () => {
                      const more = await searchITunes(current.artist, 25);
                      const others = more.filter((t) => t.id !== current.id);
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
                    onClick={() => {
                      setQuery(current.artist);
                      setShowSearch(true);
                      searchInputRef.current?.focus();
                    }}
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
                        <button
                          key={t.id}
                          onClick={() => play(t, queue, queueIdx + 1 + i)}
                          className="flex items-center gap-3 rounded-lg p-1.5 text-left hover:bg-white/10"
                        >
                          <img src={t.artwork} alt="" className="h-8 w-8 rounded" />
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-xs font-medium">{t.title}</div>
                            <div className="truncate text-[11px] text-white/55">{t.artist}</div>
                          </div>
                          {t.durationMs && (
                            <span className="text-[10px] tabular-nums text-white/40">{fmtMs(t.durationMs)}</span>
                          )}
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
                <button
                  onClick={() => toggleLike(current)}
                  className="ml-1 hidden rounded-full p-2 hover:bg-white/10 sm:block"
                >
                  <Heart className={`h-4 w-4 ${isLiked(current) ? "fill-pink-400 text-pink-400" : "text-white/70"}`} />
                </button>
              </>
            ) : (
              <div className="text-sm text-white/50">Nothing playing</div>
            )}
          </div>

          <div className="flex flex-1 flex-col items-center gap-1.5">
            <div className="flex items-center gap-2">
              <button onClick={prev} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white">
                <SkipBack className="h-4 w-4" />
              </button>
              <button
                onClick={toggle}
                className="grid h-10 w-10 place-items-center rounded-full bg-white text-black hover:scale-105 transition"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : playing ? (
                  <Pause className="h-4 w-4 fill-current" />
                ) : (
                  <Play className="h-4 w-4 fill-current" />
                )}
              </button>
              <button onClick={next} className="rounded-full p-2 text-white/80 hover:bg-white/10 hover:text-white">
                <SkipForward className="h-4 w-4" />
              </button>
              <button
                onClick={() => globalSetRepeat(!repeat)}
                className={`rounded-full p-2 hover:bg-white/10 ${repeat ? "text-primary" : "text-white/60"}`}
              >
                <Repeat className="h-4 w-4" />
              </button>
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
                <div
                  className="h-full bg-white transition-[width]"
                  style={{ width: `${duration ? (progress / duration) * 100 : 0}%` }}
                />
              </div>
              <span className="w-9 tabular-nums">{fmt(duration)}</span>
            </div>
          </div>

          <div className="hidden flex-1 items-center justify-end gap-2 md:flex">
            <button
              onClick={() => globalSetMuted(!muted)}
              className="rounded-full p-2 text-white/70 hover:bg-white/10 hover:text-white"
            >
              {muted || volume === 0 ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>
            <input
              type="range"
              min={0}
              max={100}
              value={muted ? 0 : volume}
              onChange={(e) => {
                globalSetMuted(false);
                globalSetVolume(Number(e.target.value));
              }}
              className="h-1 w-24 cursor-pointer accent-white"
              aria-label="Volume"
            />
          </div>
        </div>
      </footer>

      {/* Add-to-playlist picker */}
      {pickerFor && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setPickerFor(null)}
        >
          <div
            className="w-full max-w-sm overflow-hidden rounded-2xl bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div className="min-w-0">
                <h3 className="text-base font-semibold">Add to playlist</h3>
                <p className="mt-0.5 truncate text-xs text-white/55">
                  {pickerFor.title} — {pickerFor.artist}
                </p>
              </div>
              <button
                onClick={() => setPickerFor(null)}
                className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-3">
              <button
                onClick={() => {
                  setPickerCreateMode(true);
                  openCreate();
                }}
                className="mb-2 flex w-full items-center gap-2 rounded-xl bg-gradient-to-r from-pink-500/20 to-purple-500/20 px-3 py-2.5 text-sm font-medium ring-1 ring-white/10 hover:from-pink-500/30 hover:to-purple-500/30"
              >
                <Plus className="h-4 w-4" /> New playlist
              </button>
              <div className="max-h-64 overflow-y-auto">
                {playlists.map((pl) => (
                  <button
                    key={pl.id}
                    onClick={() => addToPlaylist(pl.id, pickerFor!)}
                    className="flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm hover:bg-white/10"
                  >
                    <ListMusic className="h-4 w-4 text-white/70" />
                    <span className="truncate">{pl.name}</span>
                    <span className="ml-auto text-xs text-white/50">{pl.tracks.length}</span>
                  </button>
                ))}
                {!playlists.length && (
                  <div className="px-3 py-6 text-center text-xs text-white/50">No playlists yet. Create one above.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create playlist */}
      {createOpen && (
        <div
          className="fixed inset-0 z-[60] grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => setCreateOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold">New playlist</h3>
                <p className="mt-0.5 text-xs text-white/55">Give it a name. You can add songs anytime.</p>
              </div>
              <button
                onClick={() => setCreateOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/45">Name</label>
              <input
                autoFocus
                value={newPlName}
                onChange={(e) => setNewPlName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newPlName.trim()) submitCreate();
                }}
                placeholder="My Vibes"
                className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/40 focus:bg-white/15 focus:ring-white/30"
              />
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button
                onClick={() => setCreateOpen(false)}
                className="rounded-lg px-3.5 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={submitCreate}
                disabled={!newPlName.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                <Plus className="h-3.5 w-3.5" /> Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import YouTube playlist */}
      {importOpen && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-black/80 p-4 backdrop-blur-md animate-in fade-in duration-150"
          onClick={() => !importing && setImportOpen(false)}
        >
          <div
            className="w-full max-w-md overflow-hidden rounded-2xl bg-zinc-950/95 shadow-2xl ring-1 ring-white/10 animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-white/10 px-5 py-4">
              <div>
                <h3 className="text-base font-semibold">Import YouTube playlist</h3>
                <p className="mt-0.5 text-xs text-white/55">
                  Paste a playlist URL or ID. Fetched via Invidious — no account needed.
                </p>
              </div>
              <button
                onClick={() => !importing && setImportOpen(false)}
                className="shrink-0 rounded-lg p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="px-5 py-4">
              <label className="mb-1.5 block text-[11px] uppercase tracking-widest text-white/45">Playlist URL</label>
              <input
                autoFocus
                value={importUrl}
                onChange={(e) => setImportUrl(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleImport();
                }}
                placeholder="https://youtube.com/playlist?list=…"
                className="w-full rounded-xl bg-white/10 px-3.5 py-2.5 text-sm outline-none ring-1 ring-white/10 placeholder:text-white/40 focus:bg-white/15 focus:ring-white/30"
              />
              {importError && (
                <div className="mt-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs text-red-300 ring-1 ring-red-500/20">
                  {importError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 border-t border-white/10 px-5 py-3">
              <button
                onClick={() => setImportOpen(false)}
                disabled={importing}
                className="rounded-lg px-3.5 py-2 text-sm text-white/70 hover:bg-white/10"
              >
                Cancel
              </button>
              <button
                onClick={handleImport}
                disabled={importing || !importUrl.trim()}
                className="flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-sm font-semibold text-black disabled:opacity-50"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Importing…
                  </>
                ) : (
                  <>
                    <Download className="h-3.5 w-3.5" /> Import
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
