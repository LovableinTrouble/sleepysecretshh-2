import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  ArrowLeft,
  Camera,
  CheckCircle2,
  Clock,
  Film,
  FolderOpen,
  LogOut,
  Mail,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { ensureAccountRows } from "@/lib/sync";
import { useAutoSync } from "@/lib/auto-sync";
import { useFolders, useSettings } from "@/lib/store";
import { useContinueWatching } from "@/lib/progress";
import { setAvatarUrl } from "@/lib/avatar";
import { DefaultAvatar } from "@/components/DefaultAvatar";

export const Route = createFileRoute("/account")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Your account — Sleepy" },
      {
        name: "description",
        content:
          "Manage your Sleepy account, profile picture and preferences. Your watchlist, continue watching and settings sync automatically across devices.",
      },
      { property: "og:title", content: "Your account — Sleepy" },
      {
        property: "og:description",
        content: "Manage your Sleepy account — your library syncs automatically across devices.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AccountPage,
});

const YEAR = 60 * 60 * 24 * 365;

function formatHours(seconds: number) {
  if (seconds < 60) return "0m";
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

function AccountPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [settings, patchSettings] = useSettings();
  const [folders] = useFolders();
  const { items: progress } = useContinueWatching();
  const { state: syncState, lastSync } = useAutoSync(user?.id ?? null);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [avatar, setAvatar] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  const stats = useMemo(() => {
    const watchlistItems = folders.reduce((n, f) => n + f.mediaIds.length, 0);
    const watchedSeconds = progress.reduce((n, p) => n + (p.positionSeconds || 0), 0);
    const completion = progress.length
      ? Math.round(
          (progress.reduce(
            (n, p) => n + (p.durationSeconds ? p.positionSeconds / p.durationSeconds : 0),
            0,
          ) /
            progress.length) *
            100,
        )
      : 0;
    const lastActive = progress.reduce((n, p) => Math.max(n, p.updatedAt || 0), 0);
    const movies = progress.filter((p) => p.mediaType === "movie").length;
    const shows = progress.filter((p) => p.mediaType !== "movie").length;
    return { watchlistItems, watchedSeconds, completion, lastActive, movies, shows };
  }, [folders, progress]);

  if (loading) {
    return (
      <div className="grid min-h-screen place-items-center">
        <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <RedirectToAuth />;
  }


  const provider = (user.app_metadata?.provider as string) || "email";
  const memberSince = user.created_at ? new Date(user.created_at) : null;

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
    setSaving(true);
    try {
      await saveProfile();
      toast.success("Profile saved");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Could not save your profile";
      toast.error(/duplicate|unique/i.test(message) ? "That username is taken" : message);
    } finally {
      setSaving(false);
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

  const syncLabel =
    settings.autoSync === false
      ? "Auto-sync is off"
      : syncState === "syncing"
        ? "Syncing changes…"
        : syncState === "error"
          ? "Last sync failed — will retry"
          : lastSync
            ? `Everything saved · ${new Date(lastSync).toLocaleTimeString()}`
            : "Ready — changes save automatically";

  return (
    <div className="relative min-h-screen px-5 pb-28 pt-6 animate-page-in md:px-8 md:pb-10">
      <BackHome />

      <div className="mx-auto mt-6 w-full max-w-4xl space-y-4">
        {/* Identity */}
        <section className="media-sidebar-card overflow-hidden rounded-3xl">
          <div
            className="h-32 w-full md:h-36"
            style={{
              background:
                "linear-gradient(120deg, color-mix(in oklab, var(--primary) 42%, transparent), color-mix(in oklab, var(--accent) 32%, transparent))",
            }}
          />
          <div className="-mt-10 flex flex-wrap items-end gap-5 px-5 pb-5 md:px-7">
            <div className="relative">
              <div className="grid h-24 w-24 place-items-center overflow-hidden rounded-full ring-4 ring-background">
                {avatar ? (
                  <img src={avatar} alt="" className="h-full w-full object-cover" />
                ) : (
                  <DefaultAvatar
                    seed={name || username || user.email || ""}
                    className="h-24 w-24 text-[6rem]"
                  />
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
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-semibold">
                <span className="inline-flex items-center gap-1 rounded-full liquid-glass px-2.5 py-1 text-muted-foreground">
                  <ShieldCheck className="h-3 w-3 text-primary" />
                  {provider === "google" ? "Google account" : "Email account"}
                </span>
                {memberSince && (
                  <span className="inline-flex items-center gap-1 rounded-full liquid-glass px-2.5 py-1 text-muted-foreground">
                    <Sparkles className="h-3 w-3 text-primary" />
                    Member since{" "}
                    {memberSince.toLocaleDateString(undefined, {
                      month: "short",
                      year: "numeric",
                    })}
                  </span>
                )}
              </div>
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
                disabled={saving}
                className="liquid-pill h-11 w-full rounded-2xl px-6 text-sm font-bold disabled:opacity-60 md:w-auto"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          </div>
        </section>

        {/* Usage */}
        <section className="media-sidebar-card rounded-3xl p-5 md:p-7">
          <div className="flex items-center gap-2">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Your activity
            </h2>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              icon={<Clock className="h-4 w-4" />}
              label="Time watched"
              value={formatHours(stats.watchedSeconds)}
            />
            <Stat
              icon={<Film className="h-4 w-4" />}
              label="Watchlist items"
              value={String(stats.watchlistItems)}
            />
            <Stat
              icon={<FolderOpen className="h-4 w-4" />}
              label="Folders"
              value={String(folders.length)}
            />
            <Stat
              icon={<RefreshCw className="h-4 w-4" />}
              label="In progress"
              value={String(progress.length)}
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            <Stat label="Movies started" value={String(stats.movies)} />
            <Stat label="Shows started" value={String(stats.shows)} />
            <Stat label="Avg. completion" value={`${stats.completion}%`} />
          </div>

          <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-foreground/10">
            <div
              className="h-full rounded-full bg-[var(--gradient-primary)] transition-all duration-700"
              style={{ width: `${Math.min(100, stats.completion)}%` }}
            />
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            {stats.lastActive
              ? `Last watched ${new Date(stats.lastActive).toLocaleString()}`
              : "Start something and your progress shows up here."}
          </p>
        </section>

        {/* Sync + preferences */}
        <section className="media-sidebar-card rounded-3xl p-5 md:p-7">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">
              Cloud sync
            </h2>
          </div>

          <div className="mt-4 flex items-center gap-3 rounded-2xl liquid-glass px-4 py-3">
            {syncState === "syncing" ? (
              <RefreshCw className="h-4 w-4 animate-spin text-primary" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-primary" />
            )}
            <div className="min-w-0">
              <div className="text-sm font-semibold">Automatic backup</div>
              <div className="truncate text-xs text-muted-foreground">{syncLabel}</div>
            </div>
          </div>

          <label className="mt-3 flex items-center justify-between gap-4 rounded-2xl liquid-glass px-4 py-3">
            <span className="text-sm font-medium">
              Keep this device in sync
              <span className="block text-xs text-muted-foreground">
                Saves your watchlist, progress and preferences as you go, and restores them when you
                open Sleepy.
              </span>
            </span>
            <input
              type="checkbox"
              checked={settings.autoSync !== false}
              onChange={(e) => patchSettings({ autoSync: e.target.checked })}
              className="h-5 w-5 accent-[var(--primary)]"
            />
          </label>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <InfoRow icon={<Mail className="h-4 w-4" />} label="Email" value={user.email ?? "—"} />
            <InfoRow
              icon={<ShieldCheck className="h-4 w-4" />}
              label="Sign-in method"
              value={provider === "google" ? "Google" : "Email & password"}
            />
          </div>
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

function Stat({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl liquid-glass px-4 py-3">
      <div className="flex items-center gap-2 text-2xl font-black tabular-nums">
        {icon && <span className="text-primary">{icon}</span>}
        {value}
      </div>
      <div className="mt-0.5 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </div>
    </div>
  );
}

function InfoRow({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl liquid-glass px-4 py-3">
      <span className="text-primary">{icon}</span>
      <div className="min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
        <div className="truncate text-sm font-medium">{value}</div>
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

/** Signed-out visitors go straight to sign in / sign up. */
function RedirectToAuth() {
  const navigate = useNavigate();
  useEffect(() => {
    void navigate({ to: "/auth", replace: true });
  }, [navigate]);
  return (
    <div className="grid min-h-screen place-items-center">
      <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
    </div>
  );
}
