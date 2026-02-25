// app/api/audit/access/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getClientIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

// ✅ JST 기준 YYYY-MM-DD
function jstDayString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}));
    const path = body.path;
    const deviceId = body.device_id ?? body.deviceId;

    if (!path || !deviceId) {
      return NextResponse.json({ ok: false, error: "path/device_id required" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // ←これ必須
    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const ip = getClientIp(req);
    const createdDay = body.created_day ?? jstDayString();

    const { error } = await admin.from("access_audit_log").insert({
      created_day: createdDay,
      path,
      ip,
      device_id: deviceId,
      user_agent: req.headers.get("user-agent") ?? null,
      accept_language: req.headers.get("accept-language") ?? null,
    });

    // 1日1回重複はOK扱い（unique violation）
    // @ts-ignore
    if (error?.code === "23505") return NextResponse.json({ ok: true, deduped: true });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "unknown" }, { status: 500 });
  }
}