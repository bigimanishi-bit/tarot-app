// app/api/audit/geo-full/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const sr = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  if (!url || !sr) return null;
  return createClient(url, sr);
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const user_id = String(body?.user_id ?? "").trim();
    const device_id = String(body?.device_id ?? "").trim();
    if (!isUuid(user_id) || !isUuid(device_id)) {
      return NextResponse.json({ ok: false, error: "invalid user_id/device_id" }, { status: 400 });
    }

    const sb = supabaseService();
    if (!sb) return NextResponse.json({ ok: false, error: "missing service role" }, { status: 500 });

    const created_day = String(body?.created_day ?? "").trim() || todayJst();

    const row = {
      created_day,
      user_id,
      device_id,
      geo_timestamp_ms: body?.geo_timestamp_ms ?? null,

      latitude: body?.latitude ?? null,
      longitude: body?.longitude ?? null,
      accuracy_m: body?.accuracy_m ?? null,

      altitude_m: body?.altitude_m ?? null,
      altitude_accuracy_m: body?.altitude_accuracy_m ?? null,
      heading_deg: body?.heading_deg ?? null,
      speed_mps: body?.speed_mps ?? null,

      vercel_country: body?.vercel_country ?? null,
      vercel_region: body?.vercel_region ?? null,
      vercel_city: body?.vercel_city ?? null,
    };

    const { error } = await sb.from("user_geo_events_full").insert(row);
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}