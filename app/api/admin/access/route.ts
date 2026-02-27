// app/api/admin/access/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../_lib";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const day = url.searchParams.get("day"); // YYYY-MM-DD 任意

  let q = admin.sb
    .from("access_audit_logs")
    .select("*")
    .order("created_day", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (day) q = q.eq("created_day", day);

  const { data, error } = await q;
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, rows: data ?? [] });
}