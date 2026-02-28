// app/welcome/AuditGeoFull.tsx
"use client";

import { useEffect } from "react";

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
  useEffect(() => {
    if (!userId) return;

    const device_id = ensureDeviceIdCookie();
    if (!device_id) return;

    const day = todayJst();

    // ✅ 開発中は「Welcome再読込ごとに毎回送る」
    // 送信回数を抑えたい時は、ここにlocalStorageガードを戻せる

    const vercel_country = getCookie("ts_geo_country");
    const vercel_region = getCookie("ts_geo_region");
    const vercel_city = getCookie("ts_geo_city");

    const run = async () => {
      // GPS失敗でも送る（nullで送る＝配管OK）
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
      } catch {
        // noop
      }

      try {
        await fetch("/api/audit/geo-full", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
      } catch {
        // noop
      }
    };

    run();
  }, [userId]);

  // ✅ 画面には何も出さない
  return null;
}