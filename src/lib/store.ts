import { useEffect, useState } from "react";
import { DEFAULT_THEME_ID } from "./themes";

// Public TMDB v3 read-access key (widely used, read-only). Baked in so users
// don't need to provide one. Override in Settings if desired.
export const PUBLIC_TMDB_KEY = "8265bd1679663a7ea12ac168da84d2e8";

export const DEFAULT_CINEPRO_URL = "https://core-lv20.onrender.com";


export interface Settings {
  theme: string; // one of THEMES[].id
  animatedBg: boolean;
  reduceMotion: boolean;
  animationsEnabled: boolean;
  glassIntensity: number;
  /** When true, hide and never auto-use sources that rely on third-party iframes
   * (those often serve ads/popups). Only "direct" sources are used. */
  disableIframeSources: boolean;
  subtitle: {
    size: number;
    color: string;
    bgOpacity: number;
    font: "Inter" | "Roboto" | "Open Sans" | "Verdana" | "Mono";
    edgeStyle: "none" | "shadow" | "outline";
  };
  player: {
    autoplay: boolean;
    autoNext: boolean;
    skipIntro: boolean;
    pip: boolean;
    quality: "auto" | "4k" | "1080p" | "720p";
  };
  integrations: {
    cineproUrl: string;
    febboxCookie: string;
    realDebrid: string;
    allDebrid: string;
    premiumize: string;
    traktToken: string;
    simklToken: string;
    openSubtitles: string;
    discordRpc: boolean;
    chromecast: boolean;
    plexSync: boolean;
    enable4k: boolean;
    /** p-stream-style proxy region for CDN routing (auto = detect by IP). */
    pstreamRegion:
      | "auto"
      | "dallas"
      | "portland"
      | "new-york"
      | "paris"
      | "hong-kong"
      | "kansas"
      | "sydney"
      | "singapore"
      | "mumbai";
  };
  /** Re-enable legacy embed scrapers (currently no extras — reserved). */
  useLegacyEmbeds: boolean;
  tmdbApiKey: string;
  preferredSource: string;
  preferredDownloadSource: string;
  /** Main embed provider used for the video player. */
  embedProvider: "vidsrc";
  /** Optional custom theme values applied when `theme === "custom"`. */
  customTheme: { primary: string; background: string } | null;
  language: "en" | "es" | "fr" | "ja" | "de";
  region: string;
  matureContent: boolean;
  posterStyle: "rounded" | "square" | "circle";
  homepageDensity: "comfy" | "compact" | "cinematic";
  enableAi: boolean;
  showRatings: boolean;
  showLogo: boolean;
  autoDownload: boolean;
  /** Has user dismissed the first-visit uBlock recommendation? */
  ublockNoticeSeen: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: DEFAULT_THEME_ID,
  animatedBg: true,
  reduceMotion: false,
  animationsEnabled: true,
  glassIntensity: 60,
  disableIframeSources: false,
  subtitle: { size: 18, color: "#ffffff", bgOpacity: 60, font: "Inter", edgeStyle: "shadow" },
  player: { autoplay: true, autoNext: true, skipIntro: false, pip: true, quality: "auto" },
  integrations: {
    cineproUrl: DEFAULT_CINEPRO_URL,
    febboxCookie: "",
    realDebrid: "",
    allDebrid: "",
    premiumize: "",
    traktToken: "",
    simklToken: "",
    openSubtitles: "",
    discordRpc: false,
    chromecast: true,
    plexSync: false,
    enable4k: false,
    pstreamRegion: "auto",
  },
  useLegacyEmbeds: false,
  tmdbApiKey: "",
  preferredSource: "febbox",
  preferredDownloadSource: "febbox",
  embedProvider: "vidsrc",
  customTheme: null,
  language: "en",
  region: "US",
  matureContent: false,
  posterStyle: "rounded",
  homepageDensity: "comfy",
  enableAi: true,
  showRatings: true,
  showLogo: true,
  autoDownload: false,
  ublockNoticeSeen: false,
};

const KEY = "sleepy.settings.v2";

let listeners: Array<() => void> = [];
let cached: Settings | null = null;

function read(): Settings {
  if (cached) return cached;
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    cached = {
      ...DEFAULT_SETTINGS,
      ...parsed,
      subtitle: { ...DEFAULT_SETTINGS.subtitle, ...(parsed?.subtitle ?? {}) },
      player: { ...DEFAULT_SETTINGS.player, ...(parsed?.player ?? {}) },
      integrations: {
        ...DEFAULT_SETTINGS.integrations,
        ...(parsed?.integrations ?? {}),
        cineproUrl: parsed?.integrations?.cineproUrl?.trim() || DEFAULT_SETTINGS.integrations.cineproUrl,
      },
    };
  } catch {
    cached = DEFAULT_SETTINGS;
  }
  return cached!;
}

export function getSettings() {
  return read();
}

export function setSettings(patch: Partial<Settings>) {
  const next = { ...read(), ...patch };
  cached = next;
  try { localStorage.setItem(KEY, JSON.stringify(next)); } catch {}
  listeners.forEach((l) => l());
}

export function useSettings(): [Settings, (p: Partial<Settings>) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    listeners.push(cb);
    return () => { listeners = listeners.filter((l) => l !== cb); };
  }, []);
  return [read(), setSettings];
}

// ===== Watchlist (folder-based) =====
export interface WatchFolder {
  id: string;
  name: string;
  emoji?: string;
  mediaIds: number[];
  createdAt: number;
}

const WL_KEY = "sleepy.watchlist.v1"; // legacy flat list (kept for backward compat)
const WF_KEY = "sleepy.watchfolders.v1";

let folderListeners: Array<() => void> = [];
let foldersCache: WatchFolder[] | null = null;

function legacyWatchlist(): number[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(WL_KEY) || "[]"); } catch { return []; }
}

function defaultFolders(): WatchFolder[] {
  return [{ id: "default", name: "My List", emoji: "", mediaIds: legacyWatchlist(), createdAt: Date.now() }];
}

export function getFolders(): WatchFolder[] {
  if (foldersCache) return foldersCache;
  if (typeof window === "undefined") return defaultFolders();
  try {
    const raw = localStorage.getItem(WF_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as WatchFolder[];
      if (Array.isArray(parsed) && parsed.length) {
        foldersCache = parsed;
        return parsed;
      }
    }
  } catch {}
  foldersCache = defaultFolders();
  try { localStorage.setItem(WF_KEY, JSON.stringify(foldersCache)); } catch {}
  return foldersCache;
}

export function saveFolders(next: WatchFolder[]) {
  foldersCache = [...next];
  try { localStorage.setItem(WF_KEY, JSON.stringify(foldersCache)); } catch {}
  // Mirror "default" folder back into legacy flat list so older code keeps working.
  const def = foldersCache.find((f) => f.id === "default");
  if (def) {
    try { localStorage.setItem(WL_KEY, JSON.stringify(def.mediaIds)); } catch {}
  }
  folderListeners.forEach((l) => l());
}

export function useFolders(): [WatchFolder[], (n: WatchFolder[]) => void] {
  const [, force] = useState(0);
  useEffect(() => {
    const cb = () => force((x) => x + 1);
    folderListeners.push(cb);
    return () => { folderListeners = folderListeners.filter((l) => l !== cb); };
  }, []);
  return [getFolders(), saveFolders];
}

export function createFolder(name: string, emoji?: string): WatchFolder {
  const f: WatchFolder = {
    id: `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    name: name.trim() || "New Folder",
    emoji,
    mediaIds: [],
    createdAt: Date.now(),
  };
  saveFolders([...getFolders(), f]);
  return f;
}

export function renameFolder(id: string, name: string) {
  saveFolders(getFolders().map((f) => (f.id === id ? { ...f, name: name.trim() || f.name } : f)));
}

export function setFolderEmoji(id: string, emoji: string) {
  saveFolders(getFolders().map((f) => (f.id === id ? { ...f, emoji } : f)));
}

export function deleteFolder(id: string) {
  if (id === "default") return;
  saveFolders(getFolders().filter((f) => f.id !== id));
}

export function addToFolder(folderId: string, mediaId: number) {
  saveFolders(
    getFolders().map((f) =>
      f.id === folderId ? { ...f, mediaIds: [...new Set([...f.mediaIds, mediaId])] } : f,
    ),
  );
}

export function removeFromFolder(folderId: string, mediaId: number) {
  saveFolders(
    getFolders().map((f) =>
      f.id === folderId ? { ...f, mediaIds: f.mediaIds.filter((x) => x !== mediaId) } : f,
    ),
  );
}

export function folderIdsContaining(mediaId: number): string[] {
  return getFolders().filter((f) => f.mediaIds.includes(mediaId)).map((f) => f.id);
}

export function isInAnyFolder(mediaId: number): boolean {
  return getFolders().some((f) => f.mediaIds.includes(mediaId));
}

// Legacy flat-list API — mirrors default folder.
export function getWatchlist(): number[] {
  const def = getFolders().find((f) => f.id === "default");
  return def?.mediaIds ?? [];
}

export function toggleWatchlist(id: number) {
  const folders = getFolders();
  const def = folders.find((f) => f.id === "default");
  if (!def) return [];
  const inList = def.mediaIds.includes(id);
  const nextIds = inList ? def.mediaIds.filter((x) => x !== id) : [...def.mediaIds, id];
  saveFolders(folders.map((f) => (f.id === "default" ? { ...f, mediaIds: nextIds } : f)));
  return nextIds;
}

