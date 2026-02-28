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
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v
  );
}

function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function numOrNull(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

// ★追加：ブラウザで叩ける疎通確認
export async function GET() {
  const hasServiceRole = !!process.env.SUPABASE_SERVICE_ROLE_KEY;
  return NextResponse.json({ ok: true, route: "geo-full", hasServiceRole });
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const user_id = String(body?.user_id ?? "").trim();
    const device_id = String(body?.device_id ?? "").trim();
    if (!isUuid(user_id) || !isUuid(device_id)) {
      return NextResponse.json(
        { ok: false, error: "invalid user_id/device_id" },
        { status: 400 }
      );
    }

    const sb = supabaseService();
    if (!sb) {
      return NextResponse.json(
        { ok: false, error: "missing SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const created_day = String(body?.created_day ?? "").trim() || todayJst();

    const lat = numOrNull(body?.latitude);
    const lng = numOrNull(body?.longitude);

    const row = {
      created_day,
      user_id,
      device_id,
      geo_timestamp_ms: body?.geo_timestamp_ms != null ? Number(body.geo_timestamp_ms) : null,

      latitude: lat === 0 ? null : lat,
      longitude: lng === 0 ? null : lng,
      accuracy_m: numOrNull(body?.accuracy_m),

      altitude_m: numOrNull(body?.altitude_m),
      altitude_accuracy_m: numOrNull(body?.altitude_accuracy_m),
      heading_deg: numOrNull(body?.heading_deg),
      speed_mps: numOrNull(body?.speed_mps),

      vercel_country: typeof body?.vercel_country === "string" ? body.vercel_country : null,
      vercel_region: typeof body?.vercel_region === "string" ? body.vercel_region : null,
      vercel_city: typeof body?.vercel_city === "string" ? body.vercel_city : null,
    };

    const { error } = await sb.from("user_geo_events_full").insert(row);
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}