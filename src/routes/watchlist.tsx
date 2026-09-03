import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  Bookmark,
  Check,
  Clock,
  FolderInput,
  FolderPlus,
  LayoutGrid,
  List,
  Pencil,
  Play,
  Search,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import {
  addToFolder,
  createFolder,
  deleteFolder,
  removeFromFolder,
  renameFolder,
  saveFolders,
  useFolders,
  type WatchFolder,
} from "@/lib/store";
import { loadStashedMedia, stashWatchMedia } from "@/lib/watch-stash";
import type { Media } from "@/lib/catalog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export const Route = createFileRoute("/watchlist")({
  head: () => ({
    meta: [
      { title: "Watchlist — Sleepy" },
      {
        name: "description",
        content:
          "Organize everything you want to watch into folders — search, sort, filter and move titles in seconds.",
      },
      { property: "og:title", content: "Watchlist — Sleepy" },
      {
        property: "og:description",
        content: "Your saved movies, series and anime, organized into custom folders.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: WatchlistPage,
});

const DRAG_MIME = "application/x-sleepy-media-id";

type SortKey = "added" | "title" | "rating" | "year";
type KindFilter = "all" | "movie" | "tv";

const SORTS: { key: SortKey; label: string }[] = [
  { key: "added", label: "Recently added" },
  { key: "title", label: "A–Z" },
  { key: "rating", label: "Top rated" },
  { key: "year", label: "Newest" },
];

function WatchlistPage() {
  const [folders] = useFolders();
  const [activeId, setActiveId] = useState<string>(folders[0]?.id ?? "default");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("added");
  const [kind, setKind] = useState<KindFilter>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [selection, setSelection] = useState<number[]>([]);
  const [moveOpen, setMoveOpen] = useState(false);

  const [pendingRemove, setPendingRemove] = useState<Media | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<WatchFolder | null>(null);
  const [pendingClear, setPendingClear] = useState<WatchFolder | null>(null);

  const active: WatchFolder | undefined = folders.find((f) => f.id === activeId) ?? folders[0];

  const allItems: Media[] = useMemo(() => {
    if (!active) return [];
    return active.mediaIds
      .map((id) => loadStashedMedia(id))
      .filter((m): m is Media => !!m)
      .reverse(); // newest first
  }, [active?.mediaIds.join(","), active?.id]);

  const items: Media[] = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = allItems.filter((m) => {
      if (kind === "movie" && m.type !== "movie") return false;
      if (kind === "tv" && m.type === "movie") return false;
      if (!term) return true;
      return (
        m.title.toLowerCase().includes(term) ||
        m.genres.some((g) => g.toLowerCase().includes(term))
      );
    });
    list = [...list];
    if (sort === "title") list.sort((a, b) => a.title.localeCompare(b.title));
    if (sort === "rating") list.sort((a, b) => b.rating - a.rating);
    if (sort === "year") list.sort((a, b) => Number(b.year) - Number(a.year));
    return list;
  }, [allItems, q, kind, sort]);

  const totals = useMemo(() => {
    const titles = folders.reduce((n, f) => n + f.mediaIds.length, 0);
    const movies = allItems.filter((m) => m.type === "movie").length;
    const shows = allItems.length - movies;
    const avg = allItems.length
      ? allItems.reduce((n, m) => n + (m.rating || 0), 0) / allItems.length
      : 0;
    return { titles, movies, shows, avg };
  }, [folders, allItems]);

  const submitCreate = () => {
    const n = newName.trim();
    if (!n) {
      setCreating(false);
      return;
    }
    const f = createFolder(n);
    setNewName("");
    setCreating(false);
    setActiveId(f.id);
  };

  const submitRename = (id: string) => {
    const n = editName.trim();
    if (n) renameFolder(id, n);
    setEditingId(null);
  };

  const onTabDragOver = (e: React.DragEvent, folderId: string) => {
    if (!e.dataTransfer.types.includes(DRAG_MIME)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverFolder(folderId);
  };
  const onTabDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFolder(null);
    const mediaId = Number(e.dataTransfer.getData(DRAG_MIME));
    if (!mediaId || !active) return;
    if (targetFolderId === active.id) return;
    addToFolder(targetFolderId, mediaId);
    removeFromFolder(active.id, mediaId);
  };

  const toggleSelect = (id: number) =>
    setSelection((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const moveSelection = (targetId: string) => {
    if (!active) return;
    selection.forEach((id) => {
      addToFolder(targetId, id);
      if (targetId !== active.id) removeFromFolder(active.id, id);
    });
    setSelection([]);
    setMoveOpen(false);
  };

  const removeSelection = () => {
    if (!active) return;
    selection.forEach((id) => removeFromFolder(active.id, id));
    setSelection([]);
  };

  const clearFolder = (folder: WatchFolder) => {
    saveFolders(folders.map((f) => (f.id === folder.id ? { ...f, mediaIds: [] } : f)));
    setSelection([]);
  };

  return (
    <main className="min-h-screen px-5 pb-36 pt-14 md:px-10 md:pt-20 animate-page-in">
      <div className="mx-auto max-w-7xl">
        {/* Header + stats */}
        <header className="media-sidebar-card rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.35em] text-primary/80">
                <Bookmark className="h-3.5 w-3.5 shrink-0" /> Your library
              </div>
              <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                Watchlist
              </h1>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="Titles" value={String(totals.titles)} />
              <Stat label="Films" value={String(totals.movies)} icon={<Play className="h-3 w-3" />} />
              <Stat label="Series" value={String(totals.shows)} icon={<Clock className="h-3 w-3" />} />
              <Stat
                label="Avg score"
                value={totals.avg ? totals.avg.toFixed(1) : "–"}
                icon={<Star className="h-3 w-3" />}
              />
            </div>
          </div>
        </header>

        {/* Folder tabs */}
        <div className="no-scrollbar mt-5 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
          {folders.map((f) => {
            const on = f.id === active?.id;
            const isEditing = editingId === f.id;
            const isDragOver = dragOverFolder === f.id;
            return (
              <div
                key={f.id}
                onDragOver={(e) => onTabDragOver(e, f.id)}
                onDragLeave={() => setDragOverFolder((cur) => (cur === f.id ? null : cur))}
                onDrop={(e) => onTabDrop(e, f.id)}
                className={`relative shrink-0 rounded-full transition ${
                  isDragOver ? "scale-105 ring-2 ring-primary/70" : ""
                }`}
              >
                <button
                  onClick={() => {
                    setActiveId(f.id);
                    setSelection([]);
                  }}
                  onDoubleClick={() => {
                    setEditingId(f.id);
                    setEditName(f.name);
                  }}
                  className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all duration-300 active:scale-95 ${
                    on
                      ? "liquid-pill"
                      : "liquid-glass text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {isEditing ? (
                    <input
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      onBlur={() => submitRename(f.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") submitRename(f.id);
                        if (e.key === "Escape") setEditingId(null);
                      }}
                      className="w-32 bg-transparent outline-none"
                    />
                  ) : (
                    <span>{f.name}</span>
                  )}
                  <span
                    className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? "bg-black/10" : "bg-white/10"}`}
                  >
                    {f.mediaIds.length}
                  </span>
                </button>
              </div>
            );
          })}

          {creating ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                submitCreate();
              }}
              className="liquid-glass flex h-11 shrink-0 items-center gap-1 rounded-full px-2"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setCreating(false);
                }}
                placeholder="Folder name"
                className="w-36 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <button
                type="submit"
                className="rounded-full bg-primary p-1.5 text-primary-foreground"
                aria-label="Create"
              >
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setNewName("");
                }}
                className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10"
                aria-label="Cancel"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex h-11 shrink-0 items-center gap-2 rounded-full border border-dashed border-white/15 px-5 text-sm font-semibold text-muted-foreground transition hover:border-primary/50 hover:bg-white/[0.05] hover:text-foreground active:scale-95"
            >
              <FolderPlus className="h-4 w-4" /> New folder
            </button>
          )}
        </div>

        {/* Toolbar */}
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="liquid-glass flex h-11 min-w-0 flex-1 items-center gap-2 rounded-full px-4 sm:max-w-xs">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={`Search ${active?.name ?? "watchlist"}`}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/70"
            />
            {q && (
              <button onClick={() => setQ("")} aria-label="Clear search">
                <X className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            )}
          </label>

          <div className="liquid-glass flex h-11 items-center gap-1 rounded-full p-1">
            {(
              [
                ["all", "All"],
                ["movie", "Films"],
                ["tv", "Series"],
              ] as [KindFilter, string][]
            ).map(([k, label]) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`h-9 rounded-full px-3.5 text-xs font-semibold transition ${
                  kind === k ? "liquid-pill" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="liquid-glass flex h-11 items-center gap-1 rounded-full p-1">
            {SORTS.map((s) => (
              <button
                key={s.key}
                onClick={() => setSort(s.key)}
                className={`h-9 rounded-full px-3 text-xs font-semibold transition ${
                  sort === s.key ? "liquid-pill" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          <div className="liquid-glass ml-auto flex h-11 items-center gap-1 rounded-full p-1">
            <button
              onClick={() => setView("grid")}
              aria-label="Grid view"
              className={`grid h-9 w-9 place-items-center rounded-full transition ${view === "grid" ? "liquid-pill" : "text-muted-foreground hover:text-foreground"}`}
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("list")}
              aria-label="List view"
              className={`grid h-9 w-9 place-items-center rounded-full transition ${view === "list" ? "liquid-pill" : "text-muted-foreground hover:text-foreground"}`}
            >
              <List className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Folder actions */}
        {active && (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate font-bold text-foreground">{active.name}</span>
              <span>
                · {items.length} shown of {active.mediaIds.length}
              </span>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <button
                onClick={() => {
                  setEditingId(active.id);
                  setEditName(active.name);
                }}
                className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-semibold transition active:scale-95"
              >
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Rename</span>
              </button>
              {active.mediaIds.length > 0 && (
                <button
                  onClick={() => setPendingClear(active)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-3.5 text-xs font-semibold text-muted-foreground transition hover:text-foreground active:scale-95"
                >
                  <X className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Clear</span>
                </button>
              )}
              {active.id !== "default" && (
                <button
                  onClick={() => setPendingFolderDelete(active)}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3.5 text-xs font-semibold text-rose-300 transition hover:bg-rose-500/20 active:scale-95"
                >
                  <Trash2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Delete</span>
                </button>
              )}
            </div>
          </div>
        )}

        {/* Items */}
        {items.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <Bookmark className="h-7 w-7 text-primary/80" />
            </div>
            <div className="text-lg font-bold">
              {allItems.length ? "No titles match your filters" : "Nothing in this folder yet"}
            </div>
            <p className="max-w-sm text-sm text-muted-foreground">
              {allItems.length
                ? "Try clearing the search or switching the type filter."
                : "Tap the + on any poster to save it here."}
            </p>
            {!allItems.length && (
              <Link
                to="/explore"
                className="liquid-pill mt-2 inline-flex h-11 items-center rounded-full px-6 text-sm font-bold"
              >
                Browse titles
              </Link>
            )}
          </div>
        ) : view === "grid" ? (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 overflow-visible sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 animate-fade-in">
            {items.map((m) => {
              const picked = selection.includes(m.id);
              return (
                <div
                  key={`${m.type}-${m.id}`}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.effectAllowed = "move";
                    e.dataTransfer.setData(DRAG_MIME, String(m.id));
                  }}
                  className="relative cursor-grab active:cursor-grabbing"
                >
                  <MediaCard media={m} fill showWatchlistControl={false} />
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      toggleSelect(m.id);
                    }}
                    aria-label={picked ? "Deselect" : "Select"}
                    className={`absolute left-2 top-2 z-20 grid h-8 w-8 place-items-center rounded-full ring-1 backdrop-blur-md transition active:scale-95 ${
                      picked
                        ? "bg-primary text-primary-foreground ring-primary/50"
                        : "bg-black/60 text-white/85 ring-white/20 hover:bg-black/80"
                    }`}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </button>
                  <button
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      setPendingRemove(m);
                    }}
                    aria-label="Remove from folder"
                    className="absolute left-2 top-11 z-20 grid h-8 w-8 place-items-center rounded-full bg-black/60 text-white/85 ring-1 ring-white/20 backdrop-blur-md transition hover:bg-rose-500 hover:ring-rose-300/60 active:scale-95"
                  >
                    <X className="h-4 w-4" strokeWidth={3} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="mt-6 space-y-2 animate-fade-in">
            {items.map((m) => {
              const picked = selection.includes(m.id);
              return (
                <div
                  key={`${m.type}-${m.id}`}
                  className={`group relative flex items-center gap-3 rounded-2xl p-2.5 ring-1 transition ${picked ? "bg-primary/10 ring-primary/35" : "ring-white/[0.06] hover:bg-white/[0.04] hover:ring-white/15"}`}
                >
                  <button
                    onClick={() => toggleSelect(m.id)}
                    aria-label={picked ? "Deselect" : "Select"}
                    className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ring-1 transition ${picked ? "bg-primary text-primary-foreground ring-primary/50" : "bg-white/8 text-white/60 ring-white/15"}`}
                  >
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </button>
                  <Link
                    to="/media/$type/$id"
                    params={{ type: m.type, id: String(m.id) }}
                    onClick={() => stashWatchMedia(m)}
                    className="flex min-w-0 flex-1 items-center gap-3"
                  >
                    <span className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-white/5 ring-1 ring-white/10">
                      {m.poster && <img src={m.poster} alt="" className="h-full w-full object-cover" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{m.title}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {m.type === "movie" ? "Film" : "Series"} · {m.year}
                        {m.genres[0] ? ` · ${m.genres[0]}` : ""}
                      </span>
                    </span>
                    <span className="hidden shrink-0 items-center gap-1 text-xs font-semibold text-foreground/80 sm:inline-flex">
                      <Star className="h-3 w-3 fill-current text-primary" />
                      {m.rating ? m.rating.toFixed(1) : "–"}
                    </span>
                  </Link>
                  <button
                    onClick={() => setPendingRemove(m)}
                    aria-label="Remove from folder"
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/8 text-muted-foreground transition hover:bg-rose-500 hover:text-white"
                  >
                    <X className="h-4 w-4" strokeWidth={2.6} />
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Selection bar */}
        {selection.length > 0 && (
          <div className="fixed bottom-24 left-1/2 z-40 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 md:bottom-28">
            <div className="nav-dock flex items-center gap-2 rounded-2xl px-3 py-2.5">
              <span className="text-sm font-bold">{selection.length} selected</span>
              <div className="relative ml-auto flex items-center gap-2">
                <button
                  onClick={() => setMoveOpen((o) => !o)}
                  className="liquid-glass inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold"
                >
                  <FolderInput className="h-3.5 w-3.5" /> Move
                </button>
                <button
                  onClick={removeSelection}
                  className="inline-flex h-9 items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/12 px-3 text-xs font-semibold text-rose-300"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Remove
                </button>
                <button
                  onClick={() => setSelection([])}
                  aria-label="Clear selection"
                  className="grid h-9 w-9 place-items-center rounded-full text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
                {moveOpen && (
                  <div className="absolute bottom-12 right-0 w-52 overflow-hidden rounded-2xl border border-white/10 bg-popover/95 p-1.5 shadow-2xl backdrop-blur-xl animate-modal-in">
                    {folders.map((f) => (
                      <button
                        key={f.id}
                        onClick={() => moveSelection(f.id)}
                        className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition hover:bg-white/[0.07]"
                      >
                        <span className="truncate">{f.name}</span>
                        <span className="text-[10px] text-muted-foreground">{f.mediaIds.length}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        <AlertDialog
          open={!!pendingRemove}
          onOpenChange={(o) => {
            if (!o) setPendingRemove(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Remove from "{active?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                "{pendingRemove?.title}" will be removed from this folder.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (active && pendingRemove) removeFromFolder(active.id, pendingRemove.id);
                  setPendingRemove(null);
                }}
                className="bg-rose-500 text-white hover:bg-rose-500/90"
              >
                Remove
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!pendingClear}
          onOpenChange={(o) => {
            if (!o) setPendingClear(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear "{pendingClear?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                Every title in this folder will be removed. The folder itself stays.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingClear) clearFolder(pendingClear);
                  setPendingClear(null);
                }}
                className="bg-rose-500 text-white hover:bg-rose-500/90"
              >
                Clear folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog
          open={!!pendingFolderDelete}
          onOpenChange={(o) => {
            if (!o) setPendingFolderDelete(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Delete folder "{pendingFolderDelete?.name}"?</AlertDialogTitle>
              <AlertDialogDescription>
                The folder will be removed. Titles inside won't be deleted from other folders.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  if (pendingFolderDelete) {
                    deleteFolder(pendingFolderDelete.id);
                    setActiveId("default");
                  }
                  setPendingFolderDelete(null);
                }}
                className="bg-rose-500 text-white hover:bg-rose-500/90"
              >
                Delete folder
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </main>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div className="liquid-glass rounded-2xl px-3.5 py-2.5">
      <div className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
        {icon}
        {label}
      </div>
      <div className="mt-0.5 text-lg font-black leading-none tabular-nums">{value}</div>
    </div>
  );
}
