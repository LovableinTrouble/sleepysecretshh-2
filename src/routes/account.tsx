import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  CloudUpload,
  CloudDownload,
  LogOut,
  RefreshCw,
  ShieldCheck,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ensureAccountRows, getLastSync, pullSync, pushSync } from "@/lib/sync";
import { getFolders, useSettings } from "@/lib/store";
import { getLocalProgress } from "@/lib/progress";

export const Route = createFileRoute("/account")({
  head: () => ({
    meta: [
      { title: "Your account — Sleepy" },
      {
        name: "description",
        content:
          "Manage your Sleepy account and sync your watchlist, continue watching and preferences across devices.",
      },
      { property: "og:title", content: "Your account — Sleepy" },
      {
        property: "og:description",
        content: "Manage your Sleepy account and sync your library across devices.",
      },
    ],
  }),
  component: AccountPage,
});

function AccountPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [settings, patchSettings] = useSettings();
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [name, setName] = useState("");

  useEffect(() => setLastSync(getLastSync()), []);

  useEffect(() => {
    if (!user) return;
    ensureAccountRows(user.id).catch(() => {});
    supabase
      .from("profiles")
      .select("display_name")
      .eq("id", user.id)
      .maybeSingle()
      .then(({ data }) => setName((data?.display_name as string) ?? ""));
  }, [user]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="relative min-h-screen px-5 pb-28 pt-8 animate-page-in md:px-8">
        <BackHome />
        <div className="mx-auto mt-16 max-w-md text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-3xl liquid-glass">
            <UserIcon className="h-7 w-7" />
          </div>
          <h1 className="mt-5 text-2xl font-black tracking-tight">No account yet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Create a free account to sync your watchlist, continue watching and preferences across
            every device.
          </p>
          <Link
            to="/auth"
            className="liquid-pill mt-6 inline-flex h-12 items-center justify-center rounded-full px-7 text-[15px] font-bold"
          >
            Sign in or sign up
          </Link>
        </div>
      </div>
    );
  }

  const folders = getFolders();
  const items = folders.reduce((n, f) => n + f.mediaIds.length, 0);
  const progressCount = getLocalProgress().length;

  const doPush = async () => {
    setBusy("push");
    try {
      await pushSync(user.id);
      setLastSync(getLastSync());
      toast.success("Uploaded to your account");
    } catch {
      toast.error("Could not upload right now");
    } finally {
      setBusy(null);
    }
  };

  const doPull = async () => {
    setBusy("pull");
    try {
      const ok = await pullSync(user.id);
      setLastSync(getLastSync());
      toast.success(ok ? "Restored from your account" : "Nothing saved yet");
    } catch {
      toast.error("Could not restore right now");
    } finally {
      setBusy(null);
    }
  };

  const saveName = async () => {
    await supabase.from("profiles").upsert({ id: user.id, display_name: name }, { onConflict: "id" });
    toast.success("Name saved");
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    toast.success("Signed out");
    navigate({ to: "/" });
  };

  return (
    <div className="relative min-h-screen px-5 pb-28 pt-8 animate-page-in md:px-8">
      <BackHome />

      <div className="mx-auto mt-8 w-full max-w-3xl space-y-5">
        {/* Identity */}
        <section className="media-sidebar-card rounded-3xl p-6">
          <div className="flex flex-wrap items-center gap-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-[var(--gradient-primary)] text-xl font-black text-primary-foreground">
              {(name || user.email || "?").slice(0, 1).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-2xl font-black tracking-tight">
                {name || "Your account"}
              </h1>
              <p className="truncate text-sm text-muted-foreground">{user.email}</p>
            </div>
            <button
              onClick={signOut}
              className="liquid-icon inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Display name"
              className="liquid-glass h-11 flex-1 rounded-2xl px-4 text-sm outline-none placeholder:text-muted-foreground"
            />
            <button
              onClick={saveName}
              className="liquid-icon h-11 rounded-2xl px-5 text-sm font-semibold"
            >
              Save
            </button>
          </div>
        </section>

        {/* Sync */}
        <section className="media-sidebar-card rounded-3xl p-6">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Sync
            </h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <Stat label="Watchlist items" value={items} />
            <Stat label="Folders" value={folders.length} />
            <Stat label="In progress" value={progressCount} />
          </div>

          <div className="mt-5 flex flex-col gap-2 sm:flex-row">
            <button
              onClick={doPush}
              disabled={busy !== null}
              className="liquid-pill inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-bold disabled:opacity-60"
            >
              <CloudUpload className={`h-4 w-4 ${busy === "push" ? "animate-pulse" : ""}`} />
              Back up this device
            </button>
            <button
              onClick={doPull}
              disabled={busy !== null}
              className="liquid-icon inline-flex h-12 flex-1 items-center justify-center gap-2 rounded-full text-[15px] font-semibold disabled:opacity-60"
            >
              <CloudDownload className={`h-4 w-4 ${busy === "pull" ? "animate-pulse" : ""}`} />
              Restore to this device
            </button>
          </div>

          <p className="mt-4 text-xs text-muted-foreground">
            {lastSync
              ? `Last synced ${new Date(lastSync).toLocaleString()}`
              : "Not synced on this device yet."}
          </p>

          <label className="mt-4 flex items-center justify-between gap-4 rounded-2xl liquid-glass px-4 py-3">
            <span className="text-sm font-medium">
              Auto-sync on launch
              <span className="block text-xs text-muted-foreground">
                Restore your library automatically when you open Sleepy.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoSync !== false}
              onChange={(e) => patchSettings({ autoSync: e.target.checked })}
              className="h-5 w-5 accent-[var(--primary)]"
            />
          </label>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-2xl liquid-glass px-4 py-3">
      <div className="text-2xl font-black tabular-nums">{value}</div>
      <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function BackHome() {
  return (
    <Link
      to="/"
      className="liquid-icon inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
    >
      <ArrowLeft className="h-4 w-4" />
      Home
    </Link>
  );
}
