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
      { title: "Watchlist — VOID" },
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


  const active: WatchFolder | undefined =
    folders.find((f) => f.id === activeId) ?? folders[0];

  const items: Media[] = useMemo(() => {
    if (!active) return [];
    return active.mediaIds
      .map((id) => loadStashedMedia(id))
      .filter((m): m is Media => !!m);
  }, [active?.mediaIds.join(","), active?.id]);


  const submitCreate = () => {
    const n = newName.trim();
    if (!n) { setCreating(false); return; }
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
    <main className="min-h-screen px-5 pb-32 pt-20 md:px-10 animate-page-in">
      <div className="mx-auto max-w-7xl">
        <div className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-primary/80">
          <Bookmark className="h-3.5 w-3.5" /> Your Library
        </div>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-4xl font-black tracking-tight md:text-6xl">Watchlist</h1>
          <div className="text-sm text-muted-foreground">
            {folders.length} folder{folders.length === 1 ? "" : "s"} ·{" "}
            {folders.reduce((sum, f) => sum + f.mediaIds.length, 0)} titles
          </div>
        </div>

        {/* Folder tabs (drop targets) */}
        <div className="mt-8 -mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
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
                  onDoubleClick={() => { setEditingId(f.id); setEditName(f.name); }}
                  className={`flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    on
                      ? "bg-primary text-primary-foreground shadow-[0_0_20px_oklch(0.72_0.18_305_/_0.45)]"
                      : "glass-strong text-muted-foreground hover:text-foreground"
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
                  <span className={`rounded-full px-1.5 text-[10px] ${on ? "bg-white/20" : "bg-white/5"}`}>
                    {f.mediaIds.length}
                  </span>
                </button>
              </div>
            );
          })}

          {creating ? (
            <form
              onSubmit={(e) => { e.preventDefault(); submitCreate(); }}
              className="flex shrink-0 items-center gap-1 rounded-full glass-strong px-2 py-1.5"
            >
              <input
                autoFocus
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Escape") setCreating(false); }}
                placeholder="Folder name"
                className="w-36 bg-transparent px-2 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <button type="submit" className="rounded-full bg-primary p-1.5 text-primary-foreground" aria-label="Create">
                <Check className="h-3.5 w-3.5" strokeWidth={3} />
              </button>
              <button type="button" onClick={() => { setCreating(false); setNewName(""); }} className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10" aria-label="Cancel">
                <X className="h-3.5 w-3.5" />
              </button>
            </form>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="flex shrink-0 items-center gap-2 rounded-full border border-dashed border-white/15 px-4 py-2 text-sm font-medium text-muted-foreground transition hover:border-primary/50 hover:text-foreground"
            >
              <FolderPlus className="h-4 w-4" /> New folder
            </button>
          )}
        </div>

        {/* Drag hint */}
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-[11px] text-muted-foreground">
          <GripVertical className="h-3.5 w-3.5 text-primary/80" />
          Tip: drag any poster onto a folder tab to move it.
        </div>

        {/* Active folder actions */}
        {active && (
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{active.name}</span>
              <span>· {active.mediaIds.length} title{active.mediaIds.length === 1 ? "" : "s"}</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => { setEditingId(active.id); setEditName(active.name); }}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium transition hover:bg-white/10"
              >
                <Pencil className="h-3.5 w-3.5" /> Rename
              </button>
              {active.id !== "default" && (
                <button
                  onClick={() => {
                    if (confirm(`Delete folder "${active.name}"? Titles inside won't be removed from other folders.`)) {
                      deleteFolder(active.id);
                      setActiveId("default");
                    }
                  }}
                  className="inline-flex items-center gap-1.5 rounded-full border border-rose-400/20 bg-rose-500/10 px-3 py-1.5 text-xs font-medium text-rose-300 transition hover:bg-rose-500/20"
                >
                  <Trash2 className="h-3.5 w-3.5" /> Delete folder
                </button>
              )}
            </div>
          </div>
        )}

        {/* Grid */}
        {items.length === 0 ? (
          <div className="mt-20 flex flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-white/10 px-6 py-20 text-center">
            <Bookmark className="h-10 w-10 text-muted-foreground/40" />
            <div className="text-lg font-semibold">Nothing in this folder yet</div>
            <p className="max-w-sm text-sm text-muted-foreground">
              Tap the <span className="rounded-full bg-primary/15 px-2 py-0.5 text-primary">+</span> on any poster to save it here.
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
                  onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPendingRemove(m); }}
                  aria-label="Remove from folder"
                  className="absolute left-2 top-2 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-black/70 text-white ring-1 ring-white/20 shadow-lg backdrop-blur-md transition active:scale-95 hover:bg-rose-500 hover:ring-rose-300/60"
                >
                  <X className="h-5 w-5" strokeWidth={3} />
                </button>
              </div>
            ))}
          </div>
        )}

        <AlertDialog open={!!pendingRemove} onOpenChange={(o) => { if (!o) setPendingRemove(null); }}>
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
      </div>
    </main>
  );

}
