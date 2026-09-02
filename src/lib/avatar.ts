import { useEffect, useState } from "react";

const KEY = "sleepy.avatarUrl";
const listeners = new Set<() => void>();

export function getAvatarUrl(): string | null {
  try {
    return localStorage.getItem(KEY) || null;
  } catch {
    return null;
  }
}

export function setAvatarUrl(url: string | null) {
  try {
    if (url) localStorage.setItem(KEY, url);
    else localStorage.removeItem(KEY);
  } catch {
    /* no-op */
  }
  listeners.forEach((l) => l());
}

/** Subscribes a component to the locally cached avatar URL. */
export function useAvatarUrl(): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(getAvatarUrl());
    const l = () => setUrl(getAvatarUrl());
    listeners.add(l);
    return () => {
      listeners.delete(l);
    };
  }, []);
  return url;
}
