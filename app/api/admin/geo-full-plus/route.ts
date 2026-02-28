// app/api/admin/geo-full-plus/route.ts
import { NextResponse } from "next/server";
import { requireAdmin } from "../_lib";

export const runtime = "nodejs";

type GeoFullRow = {
  created_day: string;
  user_id: string;
  device_id: string;
  [k: string]: any;
};

function keyOf(day: string, userId: string, deviceId: string) {
  return `${day}|||${userId}|||${deviceId}`;
}

export async function GET(req: Request) {
  const admin = await requireAdmin(req);
  if (!admin.ok) {
    return NextResponse.json({ ok: false, error: admin.error }, { status: admin.status });
  }

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get("limit") || 50), 200);
  const day = url.searchParams.get("day"); // YYYY-MM-DD 任意

  // 1) geo-full を取得
  let q = admin.sb
    .from("user_geo_events_full")
    .select("*")
    .order("created_day", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limit);

  if (day) q = q.eq("created_day", day);

  const { data: fullRows, error: fullErr } = await q;
  if (fullErr) return NextResponse.json({ ok: false, error: fullErr.message }, { status: 500 });

  const rows = (fullRows ?? []) as GeoFullRow[];
  if (rows.length === 0) return NextResponse.json({ ok: true, rows: [] });

  // 2) 同じ( created_day, user_id, device_id ) の日次住所をまとめて引く
  const keys = Array.from(
    new Set(rows.map((r) => keyOf(r.created_day, r.user_id, r.device_id)))
  );

  // Supabaseは複合キーinが弱いので、まず user_id/device_id/day を広めに絞る
  const days = Array.from(new Set(rows.map((r) => r.created_day)));
  const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
  const deviceIds = Array.from(new Set(rows.map((r) => r.device_id)));

  const { data: dailyRows, error: dailyErr } = await admin.sb
    .from("user_geo_daily")
    .select(
      "created_day,user_id,device_id,lat_round,lng_round,accuracy_m,prefecture,city_text,address_text,created_at"
    )
    .in("created_day", days)
    .in("user_id", userIds)
    .in("device_id", deviceIds);

  if (dailyErr) return NextResponse.json({ ok: false, error: dailyErr.message }, { status: 500 });

  const dailyMap = new Map<string, any>();
  for (const d of dailyRows ?? []) {
    const k = keyOf(d.created_day, d.user_id, d.device_id);
    // もし複数あっても最新を残す
    const prev = dailyMap.get(k);
    if (!prev) {
      dailyMap.set(k, d);
    } else {
      const prevT = new Date(prev.created_at).getTime();
      const curT = new Date(d.created_at).getTime();
      if (curT > prevT) dailyMap.set(k, d);
    }
  }

  // 3) geo-full に日次住所を合体
  const merged = rows.map((r) => {
    const k = keyOf(r.created_day, r.user_id, r.device_id);
    const d = dailyMap.get(k);

    return {
      ...r,
      // 住所は日次から合体（無ければnull）
      daily_prefecture: d?.prefecture ?? null,
      daily_city_text: d?.city_text ?? null,
      daily_address_text: d?.address_text ?? null,
      daily_lat_round: d?.lat_round ?? null,
      daily_lng_round: d?.lng_round ?? null,
      daily_accuracy_m: d?.accuracy_m ?? null,
    };
  });

  // keys未使用警告避け（今は利用しないが将来の厳密JOIN用）
  void keys;

  return NextResponse.json({ ok: true, rows: merged });
}