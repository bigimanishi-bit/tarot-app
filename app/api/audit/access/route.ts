// app/api/audit/access/route.ts
import { NextResponse } from "next/server";
import path from "path";
import maxmind, { CityResponse } from "maxmind";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function pickIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for") || "";
  // x-forwarded-for: "client, proxy1, proxy2"
  const first = xff.split(",")[0]?.trim();
  if (first) return first;

  const xri = req.headers.get("x-real-ip")?.trim();
  if (xri) return xri;

  return "";
}

let cityReader: maxmind.Reader<CityResponse> | null = null;

async function getCityReader() {
  if (cityReader) return cityReader;

  // ✅ 本番でも読めるよう process.cwd() 基準
  const mmdbPath = path.join(process.cwd(), "data", "GeoLite2-City.mmdb");
  cityReader = await maxmind.open<CityResponse>(mmdbPath);
  return cityReader;
}

function normPath(p: unknown) {
  const s = typeof p === "string" ? p : "";
  return s.startsWith("/") ? s : `/${s}`;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;

    const p = normPath(body?.path);
    const deviceId = typeof body?.device_id === "string" ? body.device_id.trim() : "";
    const createdDay = typeof body?.created_day === "string" ? body.created_day.trim() : "";

    if (!p || !deviceId || !createdDay) {
      return NextResponse.json({ ok: false, error: "missing fields" }, { status: 400 });
    }

    const ip = pickIp(req) || (typeof body?.ip === "string" ? body.ip.trim() : "") || "";
    const ua = req.headers.get("user-agent") || null;

    // ✅ Geo lookup（失敗してもログ自体は残す）
    let country: string | null = null;
    let region: string | null = null;
    let city: string | null = null;
    let postal: string | null = null;
    let timezone: string | null = null;

    if (ip) {
      try {
        const reader = await getCityReader();
        const geo = reader.get(ip);
        if (geo) {
          country = geo.country?.iso_code ?? null;
          region = geo.subdivisions?.[0]?.names?.en ?? null;
          city = geo.city?.names?.en ?? null;
          postal = geo.postal?.code ?? null;
          timezone = geo.location?.time_zone ?? null;
        }
      } catch {
        // mmdbが無い/読めない等 → nullのまま
      }
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    const sb = createClient(supabaseUrl, serviceRole);

    const { error } = await sb.from("access_audit_logs").insert({
      created_day: createdDay,
      path: p,
      ip: ip || "unknown",
      device_id: deviceId,
      user_agent: ua,
      country,
      region,
      city,
      postal,
      timezone,
    });

    // ✅ 1日1回制限（ユニーク制約違反）はOK扱い
    if (error) {
      // Postgres unique violation: 23505
      // supabase-js の error.code は環境で揺れるので message でも許容
      if (error.code === "23505" || String(error.message).includes("duplicate")) {
        return NextResponse.json({ ok: true, dedup: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "error" }, { status: 500 });
  }
}