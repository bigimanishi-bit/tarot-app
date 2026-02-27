// app/api/admin/devices/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../_lib";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);

  const { data, error } = await admin.sb
    .from("user_devices")
    .select("*")
    .order("last_seen_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}