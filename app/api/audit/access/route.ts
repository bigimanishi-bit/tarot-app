// app/api/audit/access/route.ts
import { NextResponse } from "next/server";
import path from "path";
import fs from "fs";

import { createClient } from "@supabase/supabase-js";
import maxmind, { type CityResponse } from "maxmind";

// ✅ 重要：mmdb読むので nodejs 固定（Edgeだと死ぬ）
export const runtime = "nodejs";
// ✅ キャッシュや静的最適化で変な挙動にならないように
export const dynamic = "force-dynamic";

type Body = {
  path?: string;
  device_id?: string;
};

function firstIpFromXff(xff: string | null) {
  if (!xff) return null;
  const first = xff.split(",")[0]?.trim();
  return first || null;
}

function getClientIp(req: Request) {
  // Vercel/Proxy想定：x-forwarded-for が基本
  const xff = req.headers.get("x-forwarded-for");
  const ipFromXff = firstIpFromXff(xff);
  if (ipFromXff) return ipFromXff;

  // 他にも環境差で入りうる
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  return "0.0.0.0";
}

function safeText(v: unknown, max = 500) {
  const s = typeof v === "string" ? v : "";
  return s.length > max ? s.slice(0, max) : s;
}

let cityReader: maxmind.Reader<CityResponse> | null = null;

async function getCityReader() {
  if (cityReader) return cityReader;

  // ✅ data/GeoLite2-City.mmdb を読む（repo 直下 data 想定）
  const mmdbPath = path.join(process.cwd(), "data", "GeoLite2-City.mmdb");

  // 存在しないなら「地理情報だけ無し」で続行（＝INSERTは止めない）
  if (!fs.existsSync(mmdbPath)) return null;

  cityReader = await maxmind.open<CityResponse>(mmdbPath);
  return cityReader;
}

function pickGeo(res: CityResponse | null) {
  if (!res) {
    return {
      country: null,
      region: null,
      city: null,
      postal: null,
      timezone: null,
    };
  }

  const country =
    res.country?.names?.ja ||
    res.country?.names?.en ||
    res.country?.iso_code ||
    null;

  const region =
    res.subdivisions?.[0]?.names?.ja ||
    res.subdivisions?.[0]?.names?.en ||
    res.subdivisions?.[0]?.iso_code ||
    null;

  const city =
    res.city?.names?.ja ||
    res.city?.names?.en ||
    res.city?.name ||
    null;

  const postal = res.postal?.code || null;
  const timezone = res.location?.time_zone || null;

  return { country, region, city, postal, timezone };
}

export async function POST(req: Request) {
  // ---- 1) 入力 ----
  let body: Body = {};
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const reqPath = safeText(body.path, 200) || "/";
  const deviceId = safeText(body.device_id, 80); // uuid文字列想定
  const ip = getClientIp(req);

  const userAgent = safeText(req.headers.get("user-agent"), 400);

  // created_day は DB の date と合わせる（UTC固定にしてズレないように）
  const createdDay = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // device_id が無いなら、ログは取らない（仕様上）
  // ※「必ず取る」にしたいならここは要変更
  if (!deviceId) {
    return NextResponse.json(
      { ok: false, reason: "missing device_id" },
      { status: 400 }
    );
  }

  // ---- 2) GeoLite2 City lookup（失敗してもINSERTは止めない）----
  let geo = {
    country: null as string | null,
    region: null as string | null,
    city: null as string | null,
    postal: null as string | null,
    timezone: null as string | null,
  };

  try {
    const reader = await getCityReader();
    if (reader) {
      const res = reader.get(ip);
      geo = pickGeo(res);
    }
  } catch {
    // 何もしない（geoだけnullのまま）
  }

  // ---- 3) Supabase insert（重複は無視）----
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    // 本番で env 入ってないとここに来る → “更新されない” の典型
    return NextResponse.json(
      { ok: false, reason: "missing env (SUPABASE_SERVICE_ROLE_KEY or URL)" },
      { status: 500 }
    );
  }

  const admin = createClient(supabaseUrl, serviceRole, {
    auth: { persistSession: false },
  });

  // unique: (created_day, path, ip, device_id)
  const { error } = await admin
    .from("access_audit_logs")
    .upsert(
      [
        {
          created_day: createdDay,
          path: reqPath,
          ip,
          device_id: deviceId,
          user_agent: userAgent || null,
          country: geo.country,
          region: geo.region,
          city: geo.city,
          postal: geo.postal,
          timezone: geo.timezone,
        },
      ],
      { onConflict: "created_day,path,ip,device_id", ignoreDuplicates: true }
    );

  if (error) {
    return NextResponse.json(
      { ok: false, reason: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ ok: true });
}