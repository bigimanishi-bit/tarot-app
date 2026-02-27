// app/api/audit/bind-device/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function makeSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    "";
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

  if (!supabaseUrl) return null;
  const key = serviceRole || anonKey;
  if (!key) return null;

  return createClient(supabaseUrl, key);
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const user_id = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const email = typeof body?.email === "string" ? body.email.trim() : null;
    const device_id =
      typeof body?.device_id === "string" ? body.device_id.trim() : "";

    const vercel_country =
      typeof body?.vercel_country === "string" ? body.vercel_country.trim() : null;
    const vercel_region =
      typeof body?.vercel_region === "string" ? body.vercel_region.trim() : null;
    const vercel_city =
      typeof body?.vercel_city === "string" ? body.vercel_city.trim() : null;

    if (!isUuid(user_id)) {
      return NextResponse.json({ ok: false, error: "invalid user_id" }, { status: 400 });
    }
    if (!isUuid(device_id)) {
      return NextResponse.json({ ok: false, error: "invalid device_id" }, { status: 400 });
    }

    const sb = makeSupabaseServerClient();
    if (!sb) {
      return NextResponse.json({ ok: false, error: "missing supabase env" }, { status: 500 });
    }

    // (user_id, device_id) で固定。存在すれば last_seen を更新。
    const { error } = await sb.from("user_devices").upsert(
      {
        user_id,
        device_id,
        email,
        last_seen_at: new Date().toISOString(),
        last_vercel_country: vercel_country,
        last_vercel_region: vercel_region,
        last_vercel_city: vercel_city,
      },
      { onConflict: "user_id,device_id" }
    );

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}