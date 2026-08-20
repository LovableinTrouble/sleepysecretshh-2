import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Bookmark, FolderPlus, Pencil, Trash2, X, Check, GripVertical } from "lucide-react";
import { MediaCard } from "@/components/MediaCard";
import {
  addToFolder,
  createFolder,
  deleteFolder,
  removeFromFolder,
  renameFolder,
  useFolders,
  type WatchFolder,
} from "@/lib/store";
import { loadStashedMedia } from "@/lib/watch-stash";
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
      { name: "description", content: "Organize what you want to watch into custom folders." },
    ],
  }),
  component: WatchlistPage,
});

const DRAG_MIME = "application/x-sleepy-media-id";

function WatchlistPage() {
  const [folders] = useFolders();
  const [activeId, setActiveId] = useState<string>(folders[0]?.id ?? "default");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [dragOverFolder, setDragOverFolder] = useState<string | null>(null);

  const [pendingRemove, setPendingRemove] = useState<Media | null>(null);
  const [pendingFolderDelete, setPendingFolderDelete] = useState<WatchFolder | null>(null);

  const active: WatchFolder | undefined = folders.find((f) => f.id === activeId) ?? folders[0];

  const items: Media[] = useMemo(() => {
    if (!active) return [];
    return active.mediaIds.map((id) => loadStashedMedia(id)).filter((m): m is Media => !!m);
  }, [active?.mediaIds.join(","), active?.id]);

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

  return (
    <main className="fixed inset-0 z-30 overflow-y-auto bg-background px-5 pb-32 pt-16 md:px-10 md:pt-20 animate-page-in">
      <div className="mx-auto max-w-7xl">
        <header className="rounded-3xl border border-white/10 bg-white/[0.035] p-5 backdrop-blur-sm sm:p-7">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.35em] text-primary/80">
                <Bookmark className="h-3.5 w-3.5 shrink-0" /> Your Library
              </div>
              <h1 className="mt-2 truncate text-3xl font-black tracking-tight sm:text-4xl md:text-5xl">
                Watchlist
              </h1>
            </div>
            <div className="shrink-0 text-right">
              <div className="text-2xl font-black leading-none md:text-3xl">
                {folders.reduce((sum, f) => sum + f.mediaIds.length, 0)}
              </div>
              <div className="mt-1 text-[11px] uppercase tracking-wider text-muted-foreground">
                titles · {folders.length} folder{folders.length === 1 ? "" : "s"}
              </div>
            </div>
          </div>
        </header>

        {/* Folder tabs (drop targets) */}
        <div className="no-scrollbar mt-6 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
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
                  isDragOver ? "ring-2 ring-primary/70 scale-105" : ""
                }`}
              >
                <button
                  onClick={() => setActiveId(f.id)}
                  onDoubleClick={() => {
                    setEditingId(f.id);
                    setEditName(f.name);
                  }}
                  className={`flex h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold transition-all duration-200 active:scale-95 ${
                    on
                      ? "bg-foreground text-background shadow-[0_10px_30px_-14px_rgba(0,0,0,0.8)]"
                      : "border border-white/10 bg-white/[0.06] text-muted-foreground backdrop-blur hover:bg-white/[0.12] hover:text-foreground"
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
                      className={`w-32 bg-transparent outline-none ${on ? "placeholder:text-primary-foreground/60" : ""}`}
                    />
                  ) : (
                    <span>{f.name}</span>
                  )}
                  <span
                    className={`min-w-5 rounded-full px-1.5 py-0.5 text-[10px] font-bold ${on ? "bg-background/15" : "bg-white/10"}`}
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
              className="flex h-11 shrink-0 items-center gap-1 rounded-full border border-white/10 bg-white/[0.06] px-2 backdrop-blur"
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

        {/* Drag hint — desktop only; clutters mobile and drag isn't usable on touch anyway */}
        <div className="mt-4 hidden md:inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5 text-primary/80" />
          Tip: drag any poster onto a folder tab to move it.
        </div>

        {/* Active folder actions */}
        {active && (
          <div className="mt-4 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3">
            <div className="flex min-w-0 items-center gap-2 text-sm text-muted-foreground">
              <span className="truncate font-bold text-foreground">{active.name}</span>
              <span>
                · {active.mediaIds.length} title{active.mediaIds.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                onClick={() => {
                  setEditingId(active.id);
                  setEditName(active.name);
                }}
                className="inline-flex h-9 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.06] px-3.5 text-xs font-semibold transition hover:bg-white/[0.12] active:scale-95"
              >
                <Pencil className="h-3.5 w-3.5" /> <span className="hidden sm:inline">Rename</span>
              </button>
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

        {/* Grid */}
        {items.length === 0 ? (
          <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center">
            <div className="grid h-14 w-14 place-items-center rounded-2xl bg-primary/12 ring-1 ring-primary/20">
              <Bookmark className="h-7 w-7 text-primary/80" />
            </div>
            <div className="text-lg font-bold">Nothing in this folder yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tap the <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">+</span>{" "}
              on any poster to save it here.
            </p>
          </div>
        ) : (
          <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-7 overflow-visible sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 animate-fade-in">
            {items.map((m) => (
              <div
                key={`${m.type}-${m.id}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.effectAllowed = "move";
                  e.dataTransfer.setData(DRAG_MIME, String(m.id));
                }}
                className="relative group/item cursor-grab active:cursor-grabbing"
              >
                <MediaCard media={m} fill />
                <button
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setPendingRemove(m);
                  }}
                  aria-label="Remove from folder"
                  className="absolute left-2 top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 shadow-lg backdrop-blur-md transition active:scale-95 hover:bg-rose-500 hover:ring-rose-300/60"
                >
                  <X className="h-5 w-5" strokeWidth={3} />
                </button>
              </div>
            ))}
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
