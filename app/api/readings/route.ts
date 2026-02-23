// app/api/readings/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

function bearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceKey) {
      return NextResponse.json({ error: "Supabase env is missing" }, { status: 500 });
    }

    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const token = bearerToken(req);
    if (!token) {
      return NextResponse.json({ error: "Authorization Bearer token is required" }, { status: 401 });
    }

    // ✅ token から user を確定（クライアントの user_id は信用しない）
    const { data: userRes, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userRes?.user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const email = userRes.user.email ?? null;
    if (!email) {
      return NextResponse.json({ error: "No email" }, { status: 401 });
    }

    // ✅ 招待制：allowlist(enabled=true) 以外は保存させない
    const { data: allowed, error: allowErr } = await admin
      .from("allowlist")
      .select("email")
      .eq("email", email)
      .eq("enabled", true)
      .limit(1);

    if (allowErr || !allowed?.[0]) {
      return NextResponse.json({ error: "invite_only" }, { status: 403 });
    }

    const body = await req.json().catch(() => ({} as any));
    const { theme, title, cards_text, result_text } = body ?? {};

    if (!cards_text || !result_text) {
      return NextResponse.json({ error: "cards_text and result_text are required" }, { status: 400 });
    }

    const { error: insErr } = await admin.from("readings").insert({
      user_id: userRes.user.id,
      theme: theme ?? null,
      title: title ?? null,
      cards_text,
      result_text,
    });

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "error" }, { status: 500 });
  }
}