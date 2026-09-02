import { supabase } from "@/integrations/supabase/client";
import { getSettings, setSettings, getFolders, saveFolders, type Settings } from "@/lib/store";
import { getLocalProgress, type LocalProgressEntry } from "@/lib/progress";

const PROGRESS_KEY = "sleepy.progress.v1";
export const LAST_SYNC_KEY = "sleepy.lastSync";

export interface SyncRow {
  settings: Partial<Settings>;
  folders: unknown[];
  progress: LocalProgressEntry[];
  updated_at: string;
}

function markSynced() {
  try {
    localStorage.setItem(LAST_SYNC_KEY, String(Date.now()));
  } catch {
    /* no-op */
  }
}

export function getLastSync(): number | null {
  try {
    const v = localStorage.getItem(LAST_SYNC_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

/** Push local settings + watchlist + progress to the cloud. */
export async function pushSync(userId: string) {
  const json = <T,>(v: T) => JSON.parse(JSON.stringify(v));
  const payload = {
    user_id: userId,
    settings: json(getSettings()),
    folders: json(getFolders()),
    progress: json(getLocalProgress()),
  };
  const { error } = await supabase.from("user_sync").upsert(payload, { onConflict: "user_id" });
  if (error) throw error;
  markSynced();
}

/** Pull cloud state down and overwrite local state. */
export async function pullSync(userId: string) {
  const { data, error } = await supabase
    .from("user_sync")
    .select("settings, folders, progress, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return false;

  const row = data as unknown as SyncRow;
  if (row.settings && typeof row.settings === "object") {
    setSettings(row.settings as Partial<Settings>);
  }
  if (Array.isArray(row.folders) && row.folders.length) {
    saveFolders(row.folders as never);
  }
  if (Array.isArray(row.progress)) {
    try {
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(row.progress));
      window.dispatchEvent(new Event("sleepy:progress-changed"));
    } catch {
      /* no-op */
    }
  }
  markSynced();
  return true;
}

/** Ensure a profile + sync row exists for the signed-in user. */
export async function ensureAccountRows(userId: string, displayName?: string | null) {
  const { error: profileError } = await supabase.from("profiles").upsert(
    { id: userId, ...(displayName ? { display_name: displayName } : {}) },
    { onConflict: "id" },
  );
  if (profileError) throw profileError;
  const { error: syncError } = await supabase
    .from("user_sync")
    .upsert({ user_id: userId }, { onConflict: "user_id" });
  if (syncError) throw syncError;
}
