// app/api/audit/access/route.ts
import { NextResponse } from "next/server";
import path from "path";
import maxmind from "maxmind";
import type { CityResponse, Reader } from "maxmind";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function normPath(p: unknown) {
  const s = typeof p === "string" ? p.trim() : "";
  if (!s) return "/(unknown)";
  return s.startsWith("/") ? s : `/${s}`;
}

function todayJstDateString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

function pickIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;

  const xri = req.headers.get("x-real-ip")?.trim();
  if (xri) return xri;

  return "";
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
}

let cityReader: Reader<CityResponse> | null = null;

async function getCityReader() {
  if (cityReader) return cityReader;
  const mmdbPath = path.join(process.cwd(), "data", "GeoLite2-City.mmdb");
  cityReader = await maxmind.open<CityResponse>(mmdbPath);
  return cityReader;
}

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

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => ({}))) as any;

    const rawDevice =
      (typeof body?.device_id === "string" ? body.device_id : "") ||
      (typeof body?.deviceId === "string" ? body.deviceId : "");
    const device_id = rawDevice.trim();

    const created_day =
      (typeof body?.created_day === "string" ? body.created_day.trim() : "") ||
      todayJstDateString();

    const p = normPath(body?.path);

    const ua = req.headers.get("user-agent") || null;

    const ip =
  (typeof body?.ip === "string" ? body.ip.trim() : "") ||
  pickIp(req) ||
  "unknown";

    // device_id が壊れてても止めない（uuid必須のDBなので生成して入れる）
    const safeDeviceId = isUuid(device_id)
      ? device_id
      : (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : null);

    let country: string | null = null;
    let region: string | null = null;
    let city: string | null = null;
    let postal: string | null = null;
    let timezone: string | null = null;

    if (ip && ip !== "unknown") {
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
        // mmdb読めない/未配置 → nullのまま続行
      }
    }

    const sb = makeSupabaseServerClient();
    if (!sb) {
      return NextResponse.json({ ok: true, skipped: true, reason: "missing supabase env" });
    }

    const finalDeviceId = safeDeviceId || "00000000-0000-0000-0000-000000000000";

    const { error } = await sb.from("access_audit_logs").insert({
      created_day,
      path: p,
      ip,
      device_id: finalDeviceId,
      user_agent: ua,
      country,
      region,
      city,
      postal,
      timezone,
    });

    if (error) {
      if (error.code === "23505" || String(error.message).includes("duplicate")) {
        return NextResponse.json({ ok: true, dedup: true });
      }
      return NextResponse.json({ ok: true, inserted: false, db_error: error.message });
    }

    return NextResponse.json({ ok: true, inserted: true });
  } catch (e: any) {
    return NextResponse.json({ ok: true, error: e?.message ?? "error" });
  }
}