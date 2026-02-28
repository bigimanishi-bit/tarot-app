// app/admin/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";

type Tab = "geo" | "geo_full" | "devices" | "access";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

async function getToken() {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

function pickLatLng(row: any): { lat: number; lng: number } | null {
  // geo-full
  const lat1 = typeof row?.latitude === "number" ? row.latitude : Number(row?.latitude);
  const lng1 = typeof row?.longitude === "number" ? row.longitude : Number(row?.longitude);
  if (Number.isFinite(lat1) && Number.isFinite(lng1) && lat1 !== 0 && lng1 !== 0) {
    return { lat: lat1, lng: lng1 };
  }

  // geo-daily
  const lat2 = typeof row?.lat_round === "number" ? row.lat_round : Number(row?.lat_round);
  const lng2 = typeof row?.lng_round === "number" ? row.lng_round : Number(row?.lng_round);
  if (Number.isFinite(lat2) && Number.isFinite(lng2) && lat2 !== 0 && lng2 !== 0) {
    return { lat: lat2, lng: lng2 };
  }

  return null;
}

function mapsUrl(lat: number, lng: number) {
  return `https://www.google.com/maps?q=${encodeURIComponent(lat)},${encodeURIComponent(lng)}`;
}

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("geo");
  const [rows, setRows] = useState<any[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [day, setDay] = useState("");
  const [limit, setLimit] = useState(50);

  const endpoint = useMemo(() => {
    if (tab === "geo") return "/api/admin/geo";
    if (tab === "geo_full") return "/api/admin/geo-full";
    if (tab === "devices") return "/api/admin/devices";
    return "/api/admin/access";
  }, [tab]);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const token = await getToken();
      if (!token) {
        setErr("未ログインです");
        setRows([]);
        setLoading(false);
        return;
      }

      const qs = new URLSearchParams();
      qs.set("limit", String(limit));
      if (day.trim()) qs.set("day", day.trim());

      const res = await fetch(`${endpoint}?${qs.toString()}`, {
        headers: { authorization: `Bearer ${token}` },
      });

      const j = await res.json().catch(() => ({} as any));
      if (!res.ok || j?.ok === false) {
        setErr(res.status === 404 ? "Not Found" : (j?.error ?? `error ${res.status}`));
        setRows([]);
      } else {
        setRows(Array.isArray(j.rows) ? j.rows : []);
      }
    } catch (e: any) {
      setErr(e?.message ?? "load error");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const cols = useMemo(() => {
    const first = rows?.[0];
    if (!first) return [];
    return Object.keys(first);
  }, [rows]);

  const showMapCol = useMemo(() => {
    // どれか1件でも座標が取れるならMap列を出す
    return rows.some((r) => !!pickLatLng(r));
  }, [rows]);

  return (
    <main className="min-h-screen bg-[#0B1020] text-white">
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <Link
                href="/welcome"
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold"
              >
                ← Welcome
              </Link>
              <div className="text-sm font-semibold">Admin</div>
            </div>
            <button
              onClick={async () => {
                await supabase.auth.signOut();
                location.href = "/login";
              }}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold"
            >
              ログアウト
            </button>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <TabBtn active={tab === "geo"} onClick={() => setTab("geo")}>
              GPS(日次)
            </TabBtn>
            <TabBtn active={tab === "geo_full"} onClick={() => setTab("geo_full")}>
              GPS(全部)
            </TabBtn>
            <TabBtn active={tab === "devices"} onClick={() => setTab("devices")}>
              端末固定
            </TabBtn>
            <TabBtn active={tab === "access"} onClick={() => setTab("access")}>
              アクセス
            </TabBtn>

            <div className="ml-auto flex flex-wrap items-center gap-2">
              <input
                value={day}
                onChange={(e) => setDay(e.target.value)}
                placeholder="day: YYYY-MM-DD (任意)"
                className="w-44 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none"
              />
              <input
                value={limit}
                onChange={(e) => setLimit(Math.max(1, Math.min(200, Number(e.target.value) || 50)))}
                className="w-20 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs outline-none"
                inputMode="numeric"
              />
              <button
                onClick={load}
                className={clsx(
                  "rounded-xl border px-3 py-2 text-xs font-semibold",
                  "border-white/12 bg-white/8 hover:bg-white/12"
                )}
              >
                {loading ? "読込中…" : "再読込"}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-4 py-6 md:px-6">
        {err ? (
          <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-4 py-3 text-sm">
            {err}
          </div>
        ) : null}

        <div className="rounded-2xl border border-white/10 bg-white/5 p-3 overflow-auto">
          {!rows.length ? (
            <div className="p-6 text-sm text-white/60">（データなし）</div>
          ) : (
            <table className="min-w-[900px] w-full text-xs">
              <thead className="text-white/70">
                <tr>
                  {showMapCol ? (
                    <th className="border-b border-white/10 px-2 py-2 text-left whitespace-nowrap">
                      map
                    </th>
                  ) : null}
                  {cols.map((c) => (
                    <th
                      key={c}
                      className="border-b border-white/10 px-2 py-2 text-left whitespace-nowrap"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const ll = pickLatLng(r);
                  return (
                    <tr key={i} className="odd:bg-white/[0.03]">
                      {showMapCol ? (
                        <td className="border-b border-white/10 px-2 py-2 whitespace-nowrap">
                          {ll ? (
                            <a
                              href={mapsUrl(ll.lat, ll.lng)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center rounded-lg border border-white/12 bg-white/8 px-2 py-1 text-[11px] font-semibold hover:bg-white/12"
                            >
                              📍Map
                            </a>
                          ) : (
                            <span className="text-white/35">—</span>
                          )}
                        </td>
                      ) : null}

                      {cols.map((c) => (
                        <td key={c} className="border-b border-white/10 px-2 py-2 whitespace-nowrap">
                          {typeof r[c] === "object" ? JSON.stringify(r[c]) : String(r[c] ?? "")}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 text-[11px] text-white/45">
          ※ GPS(日次)は丸め座標、GPS(全部)は生座標。Mapは座標がある行だけ表示。
        </div>
      </div>
    </main>
  );
}

function TabBtn({ active, onClick, children }: any) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "rounded-xl border px-3 py-2 text-xs font-semibold",
        active ? "border-white/20 bg-white/14" : "border-white/10 bg-white/6 hover:bg-white/10"
      )}
      type="button"
    >
      {children}
    </button>
  );
}