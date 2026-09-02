import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Never let a backend/env failure crash the tree — auth degrades to signed-out.
    try {
      const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
        setSession(s);
        setLoading(false);
      });
      supabase.auth.getUser().then(
        ({ data, error }) => {
          if (!error && data.user) {
            supabase.auth.getSession().then(({ data: sessionData }) => {
              setSession(sessionData.session ?? null);
              setLoading(false);
            }, () => {
              setSession(null);
              setLoading(false);
            });
            return;
          }
          setSession(null);
          setLoading(false);
        },
        () => {
          setSession(null);
          setLoading(false);
        },
      );
      return () => sub.subscription.unsubscribe();
    } catch {
      setLoading(false);
      return;
    }
  }, []);

  const user: User | null = session?.user ?? null;
  return { session, user, loading };
}
