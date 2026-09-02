import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const finish = (nextSession: Session | null) => {
      if (!active) return;
      setSession(nextSession);
      setLoading(false);
    };

    // Never let a backend/env failure crash the tree — auth degrades to signed-out.
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        finish(s);
      });
      void supabase.auth.getSession().then(({ data }) => finish(data.session ?? null), () => finish(null));

      // A network outage must never leave the account page spinning forever.
      const timeout = window.setTimeout(() => finish(null), 5000);
      return () => {
        active = false;
        window.clearTimeout(timeout);
        sub.subscription.unsubscribe();
      };
    } catch {
      finish(null);
      return () => {
        active = false;
      };
    }
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading };
}
