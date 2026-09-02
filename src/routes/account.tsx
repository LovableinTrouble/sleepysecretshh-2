import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  CloudUpload,
  CloudDownload,
  LogOut,
  RefreshCw,
  ShieldCheck,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ensureAccountRows, getLastSync, pullSync, pushSync } from "@/lib/sync";
import { getFolders, useSettings } from "@/lib/store";
import { getLocalProgress } from "@/lib/progress";
import { setAvatarUrl } from "@/lib/avatar";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your account — Sleepy" },
      {
        name: "description",
        content:
          "Manage your Sleepy account, profile picture and sync your watchlist, continue watching and preferences across devices.",
      },
      { property: "og:title", content: "Your account — Sleepy" },
      {
        property: "og:description",
        content: "Manage your Sleepy account and sync your library across devices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

const YEAR = 60 * 60 * 24 * 365;

function AccountPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [settings, patchSettings] = useSettings();
  const [busy, setBusy] = useState<"push" | "pull" | null>(null);
  const [lastSync, setLastSync] = useState<number | null>(null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setLastSync(getLastSync()), []);

  useEffect(() => {
    if (!user) return;
    ensureAccountRows(user.id).catch(() => {});
    void supabase
      .from("profiles")
      .select("display_name, username, avatar_url")
      .eq("id", user.id)
      .maybeSingle()
      .then(
        ({ data }) => {
          setName((data?.display_name as string) ?? "");
          setUsername((data?.username as string) ?? "");
          const url = (data?.avatar_url as string) ?? null;
          setAvatar(url);
          setAvatarUrl(url);
        },
        () => {
          setName("");
          setUsername("");
        },
      );
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
  const initial = (name || user.email || "?").slice(0, 1).toUpperCase();

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

  const saveProfile = async (patch?: { avatar_url?: string | null }) => {
    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        display_name: name.trim() || null,
        username: username.trim() || null,
        ...(patch ?? {}),
      },
      { onConflict: "id" },
    );
    if (error) throw error;
  };

  const onSave = async () => {
    try {
      await saveProfile();
      toast.success("Profile saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your profile";
      toast.error(/duplicate|unique/i.test(message) ? "That username is taken" : message);
    }
  };

  const onPickAvatar = async (file: File) => {
    if (!file.type.startsWith("image/")) {
      toast.error("Pick an image file");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Images must be under 5 MB");
      return;
    }
    setUploading(true);
    try {
      const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
      const path = `${user.id}/avatar-${Date.now()}.${ext}`;
      const up = await supabase.storage
        .from("avatars")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (up.error) throw up.error;
      const signed = await supabase.storage.from("avatars").createSignedUrl(path, YEAR);
      if (signed.error || !signed.data?.signedUrl) throw signed.error ?? new Error("No URL");
      const url = signed.data.signedUrl;
      await saveProfile({ avatar_url: url });
      setAvatar(url);
      setAvatarUrl(url);
      toast.success("Profile picture updated");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not upload that image");
    } finally {
      setUploading(false);
    }
  };

  const removeAvatar = async () => {
    try {
      await saveProfile({ avatar_url: null });
      setAvatar(null);
      setAvatarUrl(null);
      toast.success("Profile picture removed");
    } catch {
      toast.error("Could not remove it right now");
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setAvatarUrl(null);
      toast.success("Signed out");
      navigate({ to: "/", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not sign out");
    }
  };

  return (
    <div className="relative min-h-screen px-5 pb-28 pt-6 animate-page-in md:px-8 md:pb-10">
      <BackHome />

      <div className="mx-auto mt-6 w-full max-w-4xl space-y-4">
        {/* Identity */}
        <section className="media-sidebar-card overflow-hidden rounded-3xl">
          <div
            className="h-24 w-full"
            style={{
              background:
                "linear-gradient(120deg, color-mix(in oklab, var(--primary) 42%, transparent), color-mix(in oklab, var(--accent) 32%, transparent))",
            }}
          />
          <div className="-mt-12 flex flex-wrap items-end gap-5 px-5 pb-5 md:px-7">
            <div className="relative">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full bg-[var(--gradient-primary)] text-3xl font-black text-primary-foreground ring-4 ring-background">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  initial
                )}
              </div>
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                aria-label="Change profile picture"
                className="absolute -bottom-1 -right-1 grid h-9 w-9 place-items-center rounded-full bg-foreground text-background shadow-lg transition hover:scale-105 active:scale-95 disabled:opacity-60"
              >
                {uploading ? (
                  <RefreshCw className="h-4 w-4 animate-spin" />
                ) : (
                  <Camera className="h-4 w-4" />
                )}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (f) void onPickAvatar(f);
                }}
              />
            </div>

            <div className="min-w-0 flex-1 pb-1">
              <h1 className="truncate text-2xl font-black tracking-tight md:text-3xl">
                {name || "Your account"}
              </h1>
              <p className="truncate text-sm text-muted-foreground">
                {username ? `@${username} · ` : ""}
                {user.email}
              </p>
            </div>

            <div className="flex gap-2 pb-1">
              {avatar && (
                <button
                  onClick={removeAvatar}
                  className="liquid-icon inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
                >
                  <Trash2 className="h-4 w-4" />
                  Remove photo
                </button>
              )}
              <button
                onClick={signOut}
                className="liquid-icon inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          </div>

          <div className="grid gap-3 px-5 pb-6 md:grid-cols-[1fr_1fr_auto] md:px-7">
            <Field label="Display name">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="h-11 w-full rounded-2xl bg-transparent px-4 text-sm outline-none placeholder:text-muted-foreground liquid-glass"
              />
            </Field>
            <Field label="Username">
              <div className="liquid-glass flex h-11 items-center rounded-2xl px-4">
                <span className="text-sm text-muted-foreground">@</span>
                <input
                  value={username}
                  onChange={(e) => setUsername(e.target.value.replace(/[^a-zA-Z0-9_.]/g, ""))}
                  placeholder="username"
                  autoComplete="username"
                  maxLength={24}
                  className="ml-1 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
              </div>
            </Field>
            <div className="flex items-end">
              <button
                onClick={onSave}
                className="liquid-pill h-11 w-full rounded-2xl px-6 text-sm font-bold md:w-auto"
              >
                Save changes
              </button>
            </div>
          </div>
        </section>

        {/* Sync */}
        <section className="media-sidebar-card rounded-3xl p-5 md:p-7">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Library sync
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
      {children}
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
