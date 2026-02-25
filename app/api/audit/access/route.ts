// app/api/audit/access/route.ts
import { NextResponse } from "next/server";
import path from "path";
import maxmind from "maxmind";
import type { CityResponse, Reader } from "maxmind";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function normPath(p: unknown) {
  const s = typeof p === "string" ? p : "";
  if (!s) return "";
  return s.startsWith("/") ? s : `/${s}`;
}

function pickIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;

  const xri = req.headers.get("x-real-ip")?.trim();
  if (xri) return xri;

  return "";
}

// ✅ Node server でだけ使う / 使い回しで高速化
let cityReader: Reader<CityResponse> | null = null;

async function getCityReader() {
  if (cityReader) return cityReader;

  // ✅ Vercel/Node で読めるように cwd 基準（tarot-app/data/...）
  const mmdbPath = path.join(process.cwd(), "data", "GeoLite2-City.mmdb");
  cityReader = await maxmind.open<CityResponse>(mmdbPath);
  return cityReader;
}

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as any;

    const createdDay =
      typeof body?.created_day === "string" ? body.created_day.trim() : "";
    const p = normPath(body?.path);

    const deviceId =
      typeof body?.device_id === "string" ? body.device_id.trim() : "";

    if (!createdDay || !p || !deviceId) {
      return NextResponse.json(
        { ok: false, error: "missing fields" },
        { status: 400 }
      );
    }

    const ua = req.headers.get("user-agent") || null;

    // IP はリバプロ(=Vercel) のヘッダ優先。無ければbody.ipも許容。
    const ip =
      pickIp(req) ||
      (typeof body?.ip === "string" ? body.ip.trim() : "") ||
      "unknown";

    // Geo情報（失敗してもnullでOK）
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
        // mmdbが無い/読めない/IPv6等で失敗 → nullのまま
      }
    }

    // ✅ service_role で insert（RLS無視）※環境変数必須
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRole) {
      return NextResponse.json(
        { ok: false, error: "missing env vars" },
        { status: 500 }
      );
    }

    const sb = createClient(supabaseUrl, serviceRole);

    const { error } = await sb.from("access_audit_logs").insert({
      created_day: createdDay,
      path: p,
      ip,
      device_id: deviceId,
      user_agent: ua,
      country,
      region,
      city,
      postal,
      timezone,
    });

    // 1日1回制限（ユニーク制約違反）はOK
    if (error) {
      if (error.code === "23505" || String(error.message).includes("duplicate")) {
        return NextResponse.json({ ok: true, dedup: true });
      }
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "error" },
      { status: 500 }
    );
  }
}