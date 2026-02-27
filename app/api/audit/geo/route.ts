// app/api/audit/geo/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function makeSupabaseServerClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!supabaseUrl || !serviceRole) return null;
  return createClient(supabaseUrl, serviceRole);
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function round2(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100; // 小数2桁
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const user_id = typeof body?.user_id === "string" ? body.user_id.trim() : "";
    const device_id = typeof body?.device_id === "string" ? body.device_id.trim() : "";
    const created_day =
      typeof body?.created_day === "string" && body.created_day.trim()
        ? body.created_day.trim()
        : todayJst();

    if (!isUuid(user_id) || !isUuid(device_id)) {
      return NextResponse.json({ ok: false, error: "invalid user_id/device_id" }, { status: 400 });
    }

    const lat_round = round2(body?.lat);
    const lng_round = round2(body?.lng);
    const accuracy_m =
      body?.accuracy_m != null && Number.isFinite(Number(body.accuracy_m))
        ? Math.round(Number(body.accuracy_m))
        : null;

    const vercel_country = typeof body?.vercel_country === "string" ? body.vercel_country : null;
    const vercel_region = typeof body?.vercel_region === "string" ? body.vercel_region : null;
    const vercel_city = typeof body?.vercel_city === "string" ? body.vercel_city : null;

    const sb = makeSupabaseServerClient();
    if (!sb) {
      return NextResponse.json(
        { ok: false, error: "missing SUPABASE_SERVICE_ROLE_KEY on server" },
        { status: 500 }
      );
    }

    const { error } = await sb.from("user_geo_daily").upsert(
      {
        created_day,
        user_id,
        device_id,
        lat_round,
        lng_round,
        accuracy_m,
        vercel_country,
        vercel_region,
        vercel_city,
      },
      { onConflict: "created_day,user_id,device_id" }
    );

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}