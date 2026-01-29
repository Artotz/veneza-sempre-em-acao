import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createSupabaseBrowserClient } from "../lib/supabaseClient";
import { AuthContext, type AuthState } from "./AuthContext";

export function AuthProvider({ children }: { children: ReactNode }) {
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null,
  });
  const didValidateUserRef = useRef(false);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      setState((prev) => ({ ...prev, loading: true }));

      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (!active) return;

      setState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        error: sessionError?.message ?? null,
        loading: true,
      }));

      if (session?.access_token && !didValidateUserRef.current) {
        didValidateUserRef.current = true;
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (!active) return;

        setState((prev) => ({
          ...prev,
          user: user ?? null,
          error: userError?.message ?? prev.error ?? null,
          loading: false,
        }));
        return;
      }

      setState((prev) => ({ ...prev, loading: false }));
    };

    void bootstrap();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!active) return;
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        error: null,
      });
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [supabase]);

  const value = useMemo(() => state, [state]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
