import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let browserClient: SupabaseClient | null = null;

type EnvMap = Record<string, string | undefined>;

const readEnv = (key: string) => {
  const env = import.meta.env as EnvMap | undefined;
  if (env && key in env) {
    return env[key];
  }
  return undefined;
};

export function createSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) {
    return browserClient;
  }

  const supabaseUrl =
    readEnv("NEXT_PUBLIC_SUPABASE_URL") || readEnv("VITE_SUPABASE_URL");
  const supabaseAnonKey =
    readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") ||
    readEnv("VITE_SUPABASE_ANON_KEY");

  if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY are required."
    );
  }

  browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  return browserClient;
}
