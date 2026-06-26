import { useEffect, useState } from "react";

const KEY = "sleepy.recent-searches.v1";
const MAX = 8;

function read(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

function write(list: string[]) {
  try { localStorage.setItem(KEY, JSON.stringify(list)); } catch {}
  window.dispatchEvent(new Event("sleepy:recents-changed"));
}

export function addRecentSearch(q: string) {
  const trimmed = q.trim();
  if (!trimmed) return;
  const existing = read().filter((x) => x.toLowerCase() !== trimmed.toLowerCase());
  write([trimmed, ...existing].slice(0, MAX));
}

export function removeRecentSearch(q: string) {
  write(read().filter((x) => x !== q));
}

export function clearRecentSearches() {
  write([]);
}

export function useRecentSearches(): string[] {
  const [list, setList] = useState<string[]>(() => read());
  useEffect(() => {
    const update = () => setList(read());
    window.addEventListener("sleepy:recents-changed", update);
    window.addEventListener("storage", update);
    return () => {
      window.removeEventListener("sleepy:recents-changed", update);
      window.removeEventListener("storage", update);
    };
  }, []);
  return list;
}
