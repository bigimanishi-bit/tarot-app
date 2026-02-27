// app/api/admin/_lib.ts
import { createClient } from "@supabase/supabase-js";

export function supabaseAnon() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
  return createClient(url, anon);
}
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  return createClient(url, sr);
}

export async function requireAdmin(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!token) return { ok: false as const, status: 401, error: "missing token" };

  const anon = supabaseAnon();
  const { data: userData, error: userErr } = await anon.auth.getUser(token);
  if (userErr || !userData?.user?.email) {
    return { ok: false as const, status: 401, error: "invalid token" };
  }

  const email = userData.user.email;
  const sb = supabaseService();
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return { ok: false as const, status: 500, error: "missing service role" };
  }

  const { data: adminRow, error: adminErr } = await sb
    .from("admin_allowlist")
    .select("email, enabled")
    .eq("email", email)
    .eq("enabled", true)
    .limit(1)
    .maybeSingle();

  if (adminErr || !adminRow) {
    return { ok: false as const, status: 404, error: "not found" }; // 404で隠す
  }

  return { ok: true as const, email, sb };
}