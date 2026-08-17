import type { Media } from "./catalog";

export type ServerId = "edge" | "rize";

export interface EmbedServer {
  id: ServerId;
  name: string;
  host: string;
  tagline: string;
  supportsFebbox: boolean;
  build: (m: Media, season?: number, episode?: number, febbox?: string) => string;
}

/** EDGE — cinesrc.st embed (cleanest UI, supports Febbox tokens). */
function buildEdge(m: Media, season?: number, episode?: number, febbox?: string): string {
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
  if (febbox) p.set("febbox", febbox);
  return `${base}?${p.toString()}`;
}

/** RIZE — vidcore.io embed (best stream quality). */
function buildRize(m: Media, season?: number, episode?: number): string {
  const isShow = m.type !== "movie";
  const base = isShow
    ? `https://vidcore.io/embed/tv/${m.id}/${season ?? 1}/${episode ?? 1}`
    : `https://vidcore.io/embed/movie/${m.id}`;
  const p = new URLSearchParams({
    autoPlay: "true",
    nextEpisode: "true",
    episodeSelector: "true",
    poster: "true",
    color: "6366f1",
  });
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
    host: "vidcore.io",
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
