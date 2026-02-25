// app/api/audit/access/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function getIp(req: Request) {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const first = xff.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = req.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "0.0.0.0";
}

function safePath(p: any) {
  const s = typeof p === "string" ? p : "";
  if (s === "/login" || s === "/welcome") return s;
  return "";
}

function getJstDayYYYYMMDD() {
  // "YYYY-MM-DD"
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json(
        { error: "Missing env: NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    const body = await req.json().catch(() => ({} as any));

    const path = safePath(body?.path);
    if (!path) return NextResponse.json({ ok: true, skipped: true });

    const deviceId = typeof body?.device_id === "string" ? body.device_id.trim() : "";
    if (!deviceId) return NextResponse.json({ ok: true, skipped: true });

    const ip = getIp(req);
    const ua = req.headers.get("user-agent") ?? null;
    const createdDay = getJstDayYYYYMMDD();

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    // 1日1回制限は unique index に任せる（衝突は無視したい）
    const { error } = await supabase.from("access_audit_logs").upsert(
      {
        created_day: createdDay,
        path,
        ip,
        device_id: deviceId,
        user_agent: ua,
      },
      { onConflict: "created_day,path,ip,device_id", ignoreDuplicates: true }
    );

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ? String(e.message) : "server_error" },
      { status: 500 }
    );
  }
}