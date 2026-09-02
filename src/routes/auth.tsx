import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Mail, Lock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { ensureAccountRows, pullSync } from "@/lib/sync";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Sign in — Sleepy" },
      {
        name: "description",
        content:
          "Sign in to Sleepy to sync your watchlist, continue watching and preferences across every device.",
      },
      { property: "og:title", content: "Sign in — Sleepy" },
      {
        property: "og:description",
        content: "Sync your watchlist and preferences across devices with a Sleepy account.",
      },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/account" });
    });
  }, [navigate]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { emailRedirectTo: `${window.location.origin}/account` },
        });
        if (error) throw error;
        // Only touch the database once a session actually exists.
        if (data.session?.user) {
          await ensureAccountRows(data.session.user.id, email.split("@")[0]).catch(() => {});
          toast.success("Account created");
          navigate({ to: "/account" });
        } else {
          toast.success("Check your email to confirm your account");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        if (data.session?.user) {
          await ensureAccountRows(data.session.user.id).catch(() => {});
          await pullSync(data.session.user.id).catch(() => false);
        }
        toast.success("Welcome back");
        navigate({ to: "/account" });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  const google = async () => {
    setBusy(true);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      setBusy(false);
      toast.error("Google sign-in failed");
      return;
    }
    if (result.redirected) return;
    navigate({ to: "/account" });
  };

  return (
    <div className="relative min-h-screen px-5 pb-28 pt-8 animate-page-in md:px-8">
      <Link
        to="/"
        className="liquid-icon inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold"
      >
        <ArrowLeft className="h-4 w-4" />
        Home
      </Link>

      <div className="mx-auto mt-10 w-full max-w-md">
        <div className="media-sidebar-card rounded-3xl p-6 md:p-8">
          <h1 className="text-2xl font-black tracking-tight md:text-3xl">
            {mode === "signin" ? "Welcome back" : "Create your account"}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sync your watchlist, continue watching and preferences everywhere.
          </p>

          <button
            onClick={google}
            disabled={busy}
            className="liquid-pill mt-6 flex h-12 w-full items-center justify-center gap-3 rounded-full text-[15px] font-bold disabled:opacity-60"
          >
            <svg viewBox="0 0 24 24" className="h-5 w-5">
              <path
                fill="#4285F4"
                d="M21.6 12.2c0-.7-.06-1.36-.18-2H12v3.8h5.4a4.62 4.62 0 0 1-2 3v2.5h3.24c1.9-1.75 2.96-4.33 2.96-7.3z"
              />
              <path
                fill="#34A853"
                d="M12 22c2.7 0 4.96-.9 6.62-2.44l-3.23-2.5c-.9.6-2.05.96-3.39.96a5.98 5.98 0 0 1-5.62-4.13H3.06v2.6A10 10 0 0 0 12 22z"
              />
              <path fill="#FBBC05" d="M6.38 13.9a6 6 0 0 1 0-3.8V7.5H3.06a10 10 0 0 0 0 9l3.32-2.6z" />
              <path
                fill="#EA4335"
                d="M12 6.07c1.47 0 2.79.5 3.83 1.5l2.86-2.86A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.06 7.5l3.32 2.6A5.98 5.98 0 0 1 12 6.07z"
              />
            </svg>
            Continue with Google
          </button>

          <div className="my-6 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
            <span className="h-px flex-1 bg-foreground/10" />
            or
            <span className="h-px flex-1 bg-foreground/10" />
          </div>

          <form onSubmit={submit} className="space-y-3">
            <label className="liquid-glass flex h-12 items-center gap-3 rounded-2xl px-4">
              <Mail className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@email.com"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <label className="liquid-glass flex h-12 items-center gap-3 rounded-2xl px-4">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Password"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="liquid-pill flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold disabled:opacity-60"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <button
            onClick={() => setMode(mode === "signin" ? "signup" : "signin")}
            className="mt-5 w-full text-center text-sm text-muted-foreground transition hover:text-foreground"
          >
            {mode === "signin"
              ? "No account yet? Create one"
              : "Already have an account? Sign in"}
          </button>
        </div>
      </div>
    </div>
  );
}
