import { createContext } from "react";
import type { Session, User } from "@supabase/supabase-js";

export type AuthState = {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
};

export const AuthContext = createContext<AuthState | null>(null);
