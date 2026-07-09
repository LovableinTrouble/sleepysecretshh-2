import { findById, type Media } from "./catalog";

const KEY = (id: number) => `sleepy:watch:${id}`;
const WATCHLIST_KEY = "sleepy:watchlist.v1";

export function stashWatchMedia(m: Media) {
  try {
    localStorage.setItem(KEY(m.id), JSON.stringify(m));
  } catch {
    /* no-op */
  }
}

export function loadStashedMedia(id: number): Media | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (raw) return JSON.parse(raw) as Media;
  } catch {
    /* no-op */
  }
  return findById(id) ?? null;
}

// Watchlist functions
function getWatchlistRaw(): Media[] {
  try {
    const raw = localStorage.getItem(WATCHLIST_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as Media[];
  } catch {
    return [];
  }
}

function saveWatchlistRaw(list: Media[]) {
  try {
    localStorage.setItem(WATCHLIST_KEY, JSON.stringify(list.slice(0, 200)));
  } catch {
    /* no-op */
  }
  window.dispatchEvent(new CustomEvent("watchlist-changed"));
}

export function useWatchlist() {
  let list = getWatchlistRaw();

  const has = (m: Media) => list.some((item) => item.id === m.id && item.type === m.type);

  const add = (m: Media) => {
    if (has(m)) return;
    list = [m, ...list];
    saveWatchlistRaw(list);
  };

  const remove = (m: Media) => {
    list = list.filter((item) => !(item.id === m.id && item.type === m.type));
    saveWatchlistRaw(list);
  };

  return { list, has, add, remove };
}

export { getWatchlistRaw as getWatchlist };
