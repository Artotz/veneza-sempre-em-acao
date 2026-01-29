import type { User } from "@supabase/supabase-js";

export function getUserDisplayName(user: User | null): string | null {
  if (!user) return null;
  const metadata = (user.user_metadata ?? {}) as Record<string, unknown>;
  const fromMetadata =
    (typeof metadata.full_name === "string" && metadata.full_name.trim()) ||
    (typeof metadata.name === "string" && metadata.name.trim()) ||
    (typeof metadata.user_name === "string" && metadata.user_name.trim()) ||
    (typeof metadata.username === "string" && metadata.username.trim()) ||
    "";

  const fromEmail = user.email?.trim() ?? "";
  return (fromMetadata || fromEmail || "User").trim();
}
