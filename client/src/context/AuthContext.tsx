import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "../lib/supabase";
import { createOrganization, getMyProfile, joinOrganizationByInvite } from "../lib/rpc";
import type { User } from "../lib/types";

interface StaffStatus {
  approvalStatus: "pending" | "approved" | "rejected";
  backgroundCheckStatus: "pending" | "confirmed";
  rooms: { id: string; name: string }[];
}

// Self-serve org creation mints exactly one first admin (mode "create");
// joining an EXISTING org (mode "join", guardian-only) requires an
// admin-shared invite code — there's no public directory of churches, and
// staff accounts are always admin-created directly (lib/data.ts's
// adminCreateStaff), never self-service.
export type SignupMode = { mode: "create"; orgName: string } | { mode: "join"; inviteCode: string; phone?: string };

interface AuthState {
  user: User | null;
  staff: StaffStatus | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (
    email: string,
    password: string,
    fullName: string,
    consent: boolean,
    modeArgs: SignupMode
  ) => Promise<{ needsEmailConfirmation: boolean }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  updatePassword: (newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

// Bridges signUp() -> email confirmation -> first session: creating/joining
// an org needs the choices made at signup time, but there's no session to
// act on until the confirmation link is clicked (a different page load).
const PENDING_SIGNUP_KEY = "shmeera_pending_signup";

interface PendingSignup {
  email: string;
  fullName: string;
  consent: boolean;
  modeArgs: SignupMode;
}

function savePendingSignup(p: PendingSignup) {
  localStorage.setItem(PENDING_SIGNUP_KEY, JSON.stringify(p));
}

function readPendingSignup(email: string): PendingSignup | null {
  const raw = localStorage.getItem(PENDING_SIGNUP_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as PendingSignup;
    return parsed.email === email ? parsed : null;
  } catch {
    return null;
  }
}

function clearPendingSignup() {
  localStorage.removeItem(PENDING_SIGNUP_KEY);
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [staff, setStaff] = useState<StaffStatus | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      setUser(null);
      setStaff(null);
      setLoading(false);
      return;
    }
    try {
      let profile = await getMyProfile();
      if (!profile) {
        // No profile row yet — either mid-signup with email confirmation
        // pending, or the confirmation link was just clicked and this is the
        // first session afterward. Finish creating/joining the org now if we
        // saved the choice for this email before the confirmation redirect.
        const pending = readPendingSignup(session.user.email ?? "");
        if (pending) {
          if (pending.modeArgs.mode === "create") {
            await createOrganization(pending.modeArgs.orgName, pending.fullName, pending.consent);
          } else {
            await joinOrganizationByInvite(pending.modeArgs.inviteCode, pending.fullName, pending.consent, pending.modeArgs.phone);
          }
          clearPendingSignup();
          profile = await getMyProfile();
        }
      }
      setUser(profile?.user ?? null);
      setStaff(profile?.staff ?? null);
    } catch {
      setUser(null);
      setStaff(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    refresh();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      refresh();
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function login(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    await refresh();
  }

  async function signup(email: string, password: string, fullName: string, consent: boolean, modeArgs: SignupMode) {
    if (!consent) throw new Error("Consent is required to create an account");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    if (!data.session) {
      // This project's Auth settings require email confirmation — there's no
      // session yet to create/join an org with. Save the choice for when
      // refresh() sees the first real session after confirming.
      savePendingSignup({ email, fullName, consent, modeArgs });
      return { needsEmailConfirmation: true };
    }
    if (modeArgs.mode === "create") {
      await createOrganization(modeArgs.orgName, fullName, consent);
    } else {
      await joinOrganizationByInvite(modeArgs.inviteCode, fullName, consent, modeArgs.phone);
    }
    await refresh();
    return { needsEmailConfirmation: false };
  }

  async function logout() {
    await supabase.auth.signOut();
    setUser(null);
    setStaff(null);
  }

  // Note: this sends an email via Supabase Auth's built-in mailer, subject to
  // the same low default send-rate limit as signup confirmation emails.
  async function requestPasswordReset(email: string) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    if (error) throw error;
  }

  // Only valid within an active recovery session (the one established by
  // clicking the emailed reset link) — see pages/ResetPassword.tsx.
  async function updatePassword(newPassword: string) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw error;
  }

  return (
    <AuthContext.Provider
      value={{ user, staff, loading, login, signup, logout, refresh, requestPasswordReset, updatePassword }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
