import { useState } from "react";
import { Plus, Check } from "lucide-react";
import type { Media } from "@/lib/catalog";
import { addToFolder, removeFromFolder, isInAnyFolder, useFolders } from "@/lib/store";
import { stashWatchMedia } from "@/lib/watch-stash";
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

interface Props {
  media: Media;
  className?: string;
}

/** Single-tap watchlist toggle. Adds to/removes from the default folder. */
export function AddToWatchlistButton({ media, className }: Props) {
  useFolders(); // subscribe for re-render
  const inList = isInAnyFolder(media.id);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const onClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    if (inList) {
      setConfirmOpen(true);
      return;
    }
    stashWatchMedia(media);
    addToFolder("default", media.id);
  };

  const confirmRemove = () => {
    removeFromFolder("default", media.id);
    setConfirmOpen(false);
  };

  return (
    <>
      <button
        type="button"
        onClick={onClick}
        aria-label={inList ? "Remove from watchlist" : "Add to watchlist"}
        className={`pointer-events-auto flex h-7 w-7 items-center justify-center rounded-full opacity-100 backdrop-blur-md ring-1 shadow-md transition active:scale-95 ${
          inList
            ? "bg-primary text-primary-foreground ring-primary/60 hover:bg-primary/90"
            : "bg-black/55 text-white ring-white/20 hover:bg-black/80 hover:ring-white/45"
        } ${className ?? ""}`}
      >
        {inList ? (
          <Check className="h-3.5 w-3.5" strokeWidth={3} />
        ) : (
          <Plus className="h-3.5 w-3.5" strokeWidth={3} />
        )}

      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent
          onClick={(e) => {
            e.stopPropagation();
          }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Remove from watchlist?</AlertDialogTitle>
            <AlertDialogDescription>
              "{media.title}" will be removed from your watchlist folders.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={(e) => e.stopPropagation()}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.stopPropagation();
                confirmRemove();
              }}
              className="bg-rose-500 text-white hover:bg-rose-500/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
