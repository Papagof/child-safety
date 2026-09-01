import { createClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error("Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY — check client/.env");
}

export const supabase = createClient<Database>(url, anonKey);

export class RpcError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RpcError";
  }
}

// Every RPC in the schema raises a real Postgres exception for auth/not-found/
// precondition failures (mapped here to a thrown RpcError), and returns a
// structured `{ error: ... }` / `{ blocked: ... }` / `{ alreadyResolved: ... }`
// shape for the handful of business-outcome cases where the client needs to
// render a specific message without treating it as a hard failure — see
// supabase/migrations/0009_rpc_sessions.sql's comment on accept_checkin for why.
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  // Cast past the generated client's literal-union `fn` type: this helper is
  // the single low-level call site behind the fully-typed wrappers in
  // lib/rpc.ts, which is where real per-function type safety lives.
  const { data, error } = await (supabase.rpc as any)(fn, args ?? {});
  if (error) throw new RpcError(error.message);
  return data as T;
}
