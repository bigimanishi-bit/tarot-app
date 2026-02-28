// app/api/audit/geo/route.ts
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

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function numOrNull(x: any) {
  const n = typeof x === "number" ? x : Number(x);
  return Number.isFinite(n) ? n : null;
}

async function reverseGeocodeCityLevel(lat: number, lng: number) {
  // 市区町村レベルに寄せる（zoomを上げすぎない）
  const url =
    "https://nominatim.openstreetmap.org/reverse?format=jsonv2" +
    `&lat=${encodeURIComponent(lat)}` +
    `&lon=${encodeURIComponent(lng)}` +
    `&zoom=10&addressdetails=1&accept-language=ja`;

  const res = await fetch(url, {
    headers: {
      // NominatimはUA必須
      "User-Agent": "TarotStudio/1.0",
    },
  });

  if (!res.ok) return { prefecture: null, city_text: null, address_text: null };

  const j: any = await res.json().catch(() => null);
  const a = j?.address ?? {};

  // 日本だと state が都道府県になりやすい
  const prefecture = typeof a?.state === "string" ? a.state : null;
  const city =
    (typeof a?.city === "string" && a.city) ||
    (typeof a?.town === "string" && a.town) ||
    (typeof a?.village === "string" && a.village) ||
    (typeof a?.municipality === "string" && a.municipality) ||
    null;

  const address_text = typeof j?.display_name === "string" ? j.display_name : null;

  return {
    prefecture,
    city_text: city,
    address_text,
  };
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
    if (!sb) {
      return NextResponse.json({ ok: false, error: "missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
    }

    const created_day = String(body?.created_day ?? "").trim() || todayJst();

    const lat = numOrNull(body?.lat);
    const lng = numOrNull(body?.lng);
    const accuracy_m = body?.accuracy_m != null && Number.isFinite(Number(body.accuracy_m))
      ? Math.round(Number(body.accuracy_m))
      : null;

    // 0,0は無効
    const hasGps = lat != null && lng != null && lat !== 0 && lng !== 0;

    const lat_round = hasGps ? round2(lat!) : null;
    const lng_round = hasGps ? round2(lng!) : null;

    const vercel_country = typeof body?.vercel_country === "string" ? body.vercel_country : null;
    const vercel_region = typeof body?.vercel_region === "string" ? body.vercel_region : null;
    const vercel_city = typeof body?.vercel_city === "string" ? body.vercel_city : null;

    // 住所（市区町村レベル）を付与（GPSがあるときだけ）
    let prefecture: string | null = null;
    let city_text: string | null = null;
    let address_text: string | null = null;

    if (hasGps) {
      const addr = await reverseGeocodeCityLevel(lat_round!, lng_round!);
      prefecture = addr.prefecture;
      city_text = addr.city_text;
      address_text = addr.address_text;
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
        prefecture,
        city_text,
        address_text,
      },
      { onConflict: "created_day,user_id,device_id" }
    );

    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}