import { findById, type Media } from "./catalog";

const KEY = (id: number) => `sleepy:watch:${id}`;

export function stashWatchMedia(m: Media) {
  try { localStorage.setItem(KEY(m.id), JSON.stringify(m)); } catch {}
}

export function loadStashedMedia(id: number): Media | null {
  try {
    const raw = localStorage.getItem(KEY(id));
    if (raw) return JSON.parse(raw) as Media;
  } catch {}
  return findById(id) ?? null;
}