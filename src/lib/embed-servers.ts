import type { Media } from "./catalog";

export type ServerId = "edge" | "rize";

export interface BuildOpts {
  febbox?: string;
  /** Resume position in seconds (Continue Watching). */
  startSeconds?: number;
}

export interface EmbedServer {
  id: ServerId;
  name: string;
  host: string;
  tagline: string;
  supportsFebbox: boolean;
  build: (m: Media, season?: number, episode?: number, opts?: BuildOpts) => string;
}

/** EDGE — cinesrc.st embed (cleanest UI, supports Febbox tokens). */
function buildEdge(m: Media, season?: number, episode?: number, opts?: BuildOpts): string {
  const isShow = m.type !== "movie";
  const base = isShow
    ? `https://cinesrc.st/embed/tv/${m.id}`
    : `https://cinesrc.st/embed/movie/${m.id}`;
  const p = new URLSearchParams();
  if (isShow) {
    p.set("s", String(season ?? 1));
    p.set("e", String(episode ?? 1));
  }
  p.set("autoplay", "true");
  p.set("autonext", "true");
  p.set("autoskip", "false");
  p.set("controls", "true");
  p.set("color", "6366f1");
  if (opts?.febbox) p.set("febbox", opts.febbox);
  const start = Math.floor(opts?.startSeconds ?? 0);
  if (start > 10) {
    // cinesrc accepts a resume position; send the known aliases so playback
    // always continues where the user left off.
    p.set("progress", String(start));
    p.set("startAt", String(start));
    p.set("t", String(start));
  }
  return `${base}?${p.toString()}`;
}

/** RIZE — vidup.to embed (best stream quality). */
function buildRize(m: Media, season?: number, episode?: number, opts?: BuildOpts): string {
  const isShow = m.type !== "movie";
  const base = isShow
    ? `https://vidup.to/tv/${m.id}/${season ?? 1}/${episode ?? 1}`
    : `https://vidup.to/movie/${m.id}`;
  const p = new URLSearchParams({
    autoPlay: "true",
    nextEpisode: "true",
    episodeSelector: "true",
    poster: "true",
    color: "6366f1",
  });
  const start = Math.floor(opts?.startSeconds ?? 0);
  if (start > 10) {
    p.set("progress", String(start));
    p.set("startAt", String(start));
  }
  return `${base}?${p.toString()}`;
}

export const EMBED_SERVERS: EmbedServer[] = [
  {
    id: "edge",
    name: "Edge",
    host: "cinesrc.st",
    tagline: "Better UI",
    supportsFebbox: true,
    build: buildEdge,
  },
  {
    id: "rize",
    name: "Rize",
    host: "vidup.to",
    tagline: "Better quality",
    supportsFebbox: false,
    build: buildRize,
  },
];

const LAST_KEY = "sleepy.last-server";

export function getLastServer(): ServerId | null {
  if (typeof window === "undefined") return null;
  try {
    const v = localStorage.getItem(LAST_KEY);
    return v === "edge" || v === "rize" ? v : null;
  } catch {
    return null;
  }
}

export function setLastServer(id: ServerId) {
  try {
    localStorage.setItem(LAST_KEY, id);
  } catch {
    /* no-op */
  }
}

export function serverById(id: ServerId): EmbedServer {
  return EMBED_SERVERS.find((s) => s.id === id) ?? EMBED_SERVERS[0];
}
