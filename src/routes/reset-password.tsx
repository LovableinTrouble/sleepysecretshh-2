import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Loader2, Lock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Reset password — Sleepy" },
      { name: "description", content: "Choose a new password for your Sleepy account." },
      { property: "og:title", content: "Reset password — Sleepy" },
      { property: "og:description", content: "Choose a new password for your Sleepy account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [recoveryReady, setRecoveryReady] = useState(false);

  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    setRecoveryReady(hash.get("type") === "recovery" || hash.has("access_token"));
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecoveryReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (password !== confirmPassword) {
      toast.error("Passwords do not match");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Password updated");
      navigate({ to: "/account", replace: true });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="relative min-h-screen px-5 pb-28 pt-8 md:px-8">
      <Link to="/auth" className="liquid-icon inline-flex h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold">
        <ArrowLeft className="h-4 w-4" /> Sign in
      </Link>
      <section className="media-sidebar-card mx-auto mt-10 w-full max-w-md rounded-3xl p-6 md:p-8">
        <h1 className="text-2xl font-black md:text-3xl">Choose a new password</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {recoveryReady ? "Enter your new password below." : "Open this page from the link in your reset email."}
        </p>
        <form onSubmit={submit} className="mt-6 space-y-3">
          {[{ value: password, set: setPassword, label: "New password" }, { value: confirmPassword, set: setConfirmPassword, label: "Confirm password" }].map((field) => (
            <label key={field.label} className="liquid-glass flex h-12 items-center gap-3 rounded-2xl px-4">
              <Lock className="h-4 w-4 shrink-0 text-muted-foreground" />
              <input type="password" required minLength={6} value={field.value} onChange={(event) => field.set(event.target.value)} placeholder={field.label} className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            </label>
          ))}
          <button type="submit" disabled={busy || !recoveryReady} className="liquid-pill flex h-12 w-full items-center justify-center gap-2 rounded-full text-[15px] font-bold disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Update password
          </button>
        </form>
      </section>
    </main>
  );
}