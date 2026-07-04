// Account sync - simple account number system for cross-device sync
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

const supabase = createClient(supabaseUrl, supabaseAnonKey);

const ACCOUNT_KEY = "sleepy.account.v1";
const REGION_KEY = "sleepy.region.v2";

export type Account = {
  id: string;
  accountNumber: string;
  createdAt: string;
};

export type WatchHistoryItem = {
  id: string;
  media_id: string;
  media_type: "movie" | "tv";
  title: string;
  poster?: string;
  position_seconds: number;
  duration_seconds: number;
  season?: number;
  episode?: number;
  updated_at: string;
};

export type SyncedPreferences = {
  theme?: string;
  animatedBg?: boolean;
  animationsEnabled?: boolean;
  reduceMotion?: boolean;
  showRatings?: boolean;
  pstreamRegion?: string;
};

// Generate a random 8-character account number (client-side for speed)
function generateAccountNumber(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let result = "";
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Get stored account number
export function getStoredAccountNumber(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(ACCOUNT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed.accountNumber || null;
  } catch {
    return null;
  }
}

// Store account number
function storeAccountNumber(accountNumber: string) {
  try {
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ accountNumber }));
  } catch {}
}

// Clear stored account
export function clearStoredAccount() {
  try {
    localStorage.removeItem(ACCOUNT_KEY);
  } catch {}
}

// Get stored region
export function getStoredRegion(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(REGION_KEY);
  } catch {
    return null;
  }
}

// Store region
export function storeRegion(region: string) {
  try {
    localStorage.setItem(REGION_KEY, region);
  } catch {}
}

// Create a new account (fast - generates number client-side)
export async function createAccount(): Promise<Account | null> {
  try {
    const accountNumber = generateAccountNumber();

    const { data, error } = await supabase
      .from("accounts")
      .insert({ account_number: accountNumber })
      .select("id, account_number, created_at")
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to create account:", error);
      return null;
    }

    const account: Account = {
      id: data.id,
      accountNumber: data.account_number,
      createdAt: data.created_at,
    };

    storeAccountNumber(account.accountNumber);
    return account;
  } catch (err) {
    console.error("Create account error:", err);
    return null;
  }
}

// Login with existing account number
export async function loginWithAccountNumber(accountNumber: string): Promise<Account | null> {
  try {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, account_number, created_at")
      .eq("account_number", accountNumber.toUpperCase())
      .maybeSingle();

    if (error || !data) {
      console.error("Failed to login:", error);
      return null;
    }

    const account: Account = {
      id: data.id,
      accountNumber: data.account_number,
      createdAt: data.created_at,
    };

    storeAccountNumber(account.accountNumber);

    // Fetch and apply stored preferences
    const prefs = await getPreferences();
    if (prefs?.pstreamRegion) {
      storeRegion(prefs.pstreamRegion);
    }

    return account;
  } catch (err) {
    console.error("Login error:", err);
    return null;
  }
}

// Get account by stored number
export async function getCurrentAccount(): Promise<Account | null> {
  const accountNumber = getStoredAccountNumber();
  if (!accountNumber) return null;

  try {
    const { data, error } = await supabase
      .from("accounts")
      .select("id, account_number, created_at")
      .eq("account_number", accountNumber)
      .maybeSingle();

    if (error || !data) return null;

    return {
      id: data.id,
      accountNumber: data.account_number,
      createdAt: data.created_at,
    };
  } catch {
    return null;
  }
}

// Sync watch progress to cloud
export async function syncWatchProgress(
  mediaId: string | number,
  mediaType: "movie" | "tv",
  title: string,
  poster: string | undefined,
  positionSeconds: number,
  durationSeconds: number,
  season?: number,
  episode?: number
): Promise<boolean> {
  const accountNumber = getStoredAccountNumber();
  if (!accountNumber) return false;

  try {
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("account_number", accountNumber)
      .maybeSingle();

    if (!account) return false;

    await supabase
      .from("watch_history")
      .upsert(
        {
          account_id: account.id,
          media_id: String(mediaId),
          media_type: mediaType,
          title,
          poster,
          position_seconds: Math.floor(positionSeconds),
          duration_seconds: Math.floor(durationSeconds),
          season: season ?? null,
          episode: episode ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id,media_id,media_type,season,episode" }
      );

    return true;
  } catch {
    return false;
  }
}

// Get watch history from cloud
export async function getWatchHistory(): Promise<WatchHistoryItem[]> {
  const accountNumber = getStoredAccountNumber();
  if (!accountNumber) return [];

  try {
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("account_number", accountNumber)
      .maybeSingle();

    if (!account) return [];

    const { data, error } = await supabase
      .from("watch_history")
      .select("*")
      .eq("account_id", account.id)
      .order("updated_at", { ascending: false })
      .limit(100);

    if (error || !data) return [];

    return data.map((item) => ({
      id: item.id,
      media_id: item.media_id,
      media_type: item.media_type,
      title: item.title,
      poster: item.poster,
      position_seconds: item.position_seconds,
      duration_seconds: item.duration_seconds,
      season: item.season,
      episode: item.episode,
      updated_at: item.updated_at,
    }));
  } catch {
    return [];
  }
}

// Sync preferences to cloud (including region)
export async function syncPreferences(prefs: SyncedPreferences): Promise<boolean> {
  const accountNumber = getStoredAccountNumber();
  if (!accountNumber) return false;

  // Also save region to localStorage
  if (prefs.pstreamRegion) {
    storeRegion(prefs.pstreamRegion);
  }

  try {
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("account_number", accountNumber)
      .maybeSingle();

    if (!account) return false;

    const { error } = await supabase
      .from("preferences")
      .upsert(
        {
          account_id: account.id,
          settings_json: prefs,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "account_id" }
      );

    return !error;
  } catch {
    return false;
  }
}

// Get preferences from cloud
export async function getPreferences(): Promise<SyncedPreferences | null> {
  const accountNumber = getStoredAccountNumber();
  if (!accountNumber) return null;

  try {
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("account_number", accountNumber)
      .maybeSingle();

    if (!account) return null;

    const { data, error } = await supabase
      .from("preferences")
      .select("settings_json")
      .eq("account_id", account.id)
      .maybeSingle();

    if (error || !data) return null;

    return data.settings_json as SyncedPreferences;
  } catch {
    return null;
  }
}

// Delete watch history item
export async function deleteWatchHistoryItem(itemId: string): Promise<boolean> {
  try {
    const { error } = await supabase
      .from("watch_history")
      .delete()
      .eq("id", itemId);

    return !error;
  } catch {
    return false;
  }
}

export { supabase };
