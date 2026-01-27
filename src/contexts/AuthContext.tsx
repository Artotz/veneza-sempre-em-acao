import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged } from "firebase/auth";
import { get, ref } from "firebase/database";
import { auth, db } from "../lib/firebase";
import {
  BRANCH_KEYS,
  resolveBranchList,
  type BranchKey,
} from "../utils/branches";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  isAdmin: boolean;
  branches: BranchKey[];
};

const AuthContext = createContext<AuthContextValue | null>(null);

type UserProfile = {
  isAdmin: boolean;
  branches: BranchKey[];
};

const DEFAULT_PROFILE: UserProfile = {
  isAdmin: false,
  branches: [...BRANCH_KEYS],
};

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, (currentUser) => {
      setLoading(true);
      setUser(currentUser);

      if (!currentUser) {
        if (!cancelled) {
          setProfile(DEFAULT_PROFILE);
          setLoading(false);
        }
        return;
      }

      const fetchUserProfile = async () => {
        try {
          const snapshot = await get(ref(db, `users/${currentUser.uid}`));
          if (cancelled) return;
          const payload = snapshot.exists() ? snapshot.val() : null;
          const isAdmin =
            payload != null &&
            typeof payload === "object" &&
            (payload as Record<string, unknown>).isAdmin === true;
          const rawBranches =
            payload && typeof payload === "object"
              ? // aceita tanto "filial" quanto "filiais" do RTDB
                (payload as Record<string, unknown>).filial ??
                (payload as Record<string, unknown>).filiais
              : null;
          const branches = resolveBranchList(rawBranches);

          setProfile({
            isAdmin,
            branches: isAdmin ? [...BRANCH_KEYS] : branches,
          });
        } catch (err) {
          console.error("[AUTH] Failed to load user profile", err);
          if (!cancelled) {
            setProfile(DEFAULT_PROFILE);
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      };

      void fetchUserProfile();
    });
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      isAdmin: profile.isAdmin,
      branches: profile.branches,
    }),
    [user, loading, profile.branches, profile.isAdmin]
  );

  return (
    <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
