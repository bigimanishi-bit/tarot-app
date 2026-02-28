// app/welcome/AuditGeoFull.tsx
"use client";

import { useEffect, useState } from "react";

function getCookie(name: string) {
  const m = document.cookie.match(new RegExp("(^| )" + name + "=([^;]+)"));
  return m ? decodeURIComponent(m[2]) : null;
}
function setCookie(name: string, value: string) {
  const maxAge = 60 * 60 * 24 * 365;
  document.cookie = `${encodeURIComponent(name)}=${encodeURIComponent(
    value
  )}; Path=/; Max-Age=${maxAge}; SameSite=Lax; Secure`;
}
function ensureDeviceIdCookie() {
  let deviceId = getCookie("ts_device_id");
  if (deviceId) return deviceId;
  const uuid = (globalThis.crypto?.randomUUID && globalThis.crypto.randomUUID()) || "";
  if (!uuid) return null;
  setCookie("ts_device_id", uuid);
  return uuid;
}
function todayJst() {
  const jst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export default function AuditGeoFull({ userId }: { userId: string | null }) {
  const [dbg, setDbg] = useState<any>(null);

  useEffect(() => {
    const qs = new URLSearchParams(window.location.search);
    const debug = qs.get("debug_geo") === "1";
    const force = qs.get("force_geo") === "1";

    if (!userId) {
      if (debug) setDbg({ ok: false, reason: "userId is null (not logged in or not set)" });
      return;
    }

    const device_id = ensureDeviceIdCookie();
    if (!device_id) {
      if (debug) setDbg({ ok: false, reason: "device_id missing" });
      return;
    }

    const day = todayJst();
    const isProd = process.env.NODE_ENV === "production";
    const key = `ts_geo_full_sent_${day}_${userId}_${device_id}`;
    if (isProd && !force && localStorage.getItem(key) === "1") {
      if (debug) setDbg({ ok: true, skipped: true, reason: "daily guard", key });
      return;
    }

    const vercel_country = getCookie("ts_geo_country");
    const vercel_region = getCookie("ts_geo_region");
    const vercel_city = getCookie("ts_geo_city");

    const run = async () => {
      // GPS失敗でも送る（nullで送ってDBが増えるかで配管確認）
      let payload: any = {
        created_day: day,
        user_id: userId,
        device_id,
        vercel_country: vercel_country ?? null,
        vercel_region: vercel_region ?? null,
        vercel_city: vercel_city ?? null,

        geo_timestamp_ms: null,
        latitude: null,
        longitude: null,
        accuracy_m: null,
        altitude_m: null,
        altitude_accuracy_m: null,
        heading_deg: null,
        speed_mps: null,
      };

      try {
        if (navigator.geolocation) {
          const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: true,
              timeout: 10000,
              maximumAge: 0,
            });
          });
          const { coords, timestamp } = pos;
          payload = {
            ...payload,
            geo_timestamp_ms: timestamp,
            latitude: coords.latitude,
            longitude: coords.longitude,
            accuracy_m: coords.accuracy,
            altitude_m: coords.altitude,
            altitude_accuracy_m: coords.altitudeAccuracy,
            heading_deg: coords.heading,
            speed_mps: coords.speed,
          };
        }
      } catch (e: any) {
        if (debug) payload._gps_error = e?.message ?? String(e);
      }

      try {
        const res = await fetch("/api/audit/geo-full", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const j = await res.json().catch(() => ({} as any));

        if (debug) {
          setDbg({
            at: new Date().toISOString(),
            status: res.status,
            ok: res.ok,
            body: j,
            sent: {
              user_id: payload.user_id,
              device_id: payload.device_id,
              day: payload.created_day,
              lat: payload.latitude,
              lng: payload.longitude,
              gps_error: payload._gps_error ?? null,
            },
          });
        }

        if (!res.ok || j?.ok === false) return;
        if (isProd) localStorage.setItem(key, "1");
      } catch (e: any) {
        if (debug) {
          setDbg({
            at: new Date().toISOString(),
            status: "fetch_error",
            ok: false,
            body: { error: e?.message ?? String(e) },
          });
        }
      }
    };

    run();
  }, [userId]);

  // ?debug_geo=1 のときだけ表示
  if (typeof window !== "undefined") {
    const qs = new URLSearchParams(window.location.search);
    if (qs.get("debug_geo") === "1") {
      return (
        <div
          style={{
            position: "fixed",
            right: 12,
            bottom: 12,
            zIndex: 9999,
            maxWidth: 460,
            background: "rgba(0,0,0,0.75)",
            border: "1px solid rgba(255,255,255,0.15)",
            borderRadius: 12,
            padding: 12,
            color: "white",
            fontSize: 12,
            lineHeight: 1.4,
            whiteSpace: "pre-wrap",
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 6 }}>geo-full debug</div>
          {dbg ? JSON.stringify(dbg, null, 2) : "sending..."}
        </div>
      );
    }
  }

  return null;
}