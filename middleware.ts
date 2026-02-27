// middleware.ts
import { NextResponse, NextRequest } from "next/server";

function isTargetPath(pathname: string) {
  return pathname === "/login" || pathname === "/welcome";
}

function getOrCreateDeviceId(req: NextRequest) {
  const existing = req.cookies.get("ts_device_id")?.value;
  if (existing) return { deviceId: existing, isNew: false };
  const deviceId = crypto.randomUUID();
  return { deviceId, isNew: true };
}

function pickClientIp(req: NextRequest) {
  const xff = (req.headers.get("x-forwarded-for") || "").trim();
  const xri = (req.headers.get("x-real-ip") || "").trim();
  const cfc = (req.headers.get("cf-connecting-ip") || "").trim();

  const first = xff.split(",")[0]?.trim();
  const ip_client = first || cfc || xri || null;
  const ip_proxy = xri || cfc || null;

  return { xff: xff || null, ip_client, ip_proxy };
}

function pickVercelGeo(req: NextRequest) {
  const vercel_country = (req.headers.get("x-vercel-ip-country") || "").trim();
  const vercel_region = (req.headers.get("x-vercel-ip-country-region") || "").trim();
  const vercel_city = (req.headers.get("x-vercel-ip-city") || "").trim();
  return {
    vercel_country: vercel_country || null,
    vercel_region: vercel_region || null,
    vercel_city: vercel_city || null,
  };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!isTargetPath(pathname)) return NextResponse.next();

  const { deviceId, isNew } = getOrCreateDeviceId(req);
  const res = NextResponse.next();

  // device_id cookie
  if (isNew) {
    res.cookies.set("ts_device_id", deviceId, {
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  const { xff, ip_client, ip_proxy } = pickClientIp(req);
  const { vercel_country, vercel_region, vercel_city } = pickVercelGeo(req);

  // ★追加：geo を cookie にも保存（login側から読んで bind に渡す）
  if (vercel_country) {
    res.cookies.set("ts_geo_country", vercel_country, {
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 1週間でOK
    });
  }
  if (vercel_region) {
    res.cookies.set("ts_geo_region", vercel_region, {
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }
  if (vercel_city) {
    res.cookies.set("ts_geo_city", vercel_city, {
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
  }

  // 監査ログPOST（失敗しても止めない）
  try {
    const url = new URL("/api/audit/access", req.url);
    const created_day = new Date(Date.now() + 9 * 60 * 60 * 1000)
      .toISOString()
      .slice(0, 10);

    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        created_day,
        path: pathname,
        device_id: deviceId,
        ip: ip_client,
        xff,
        ip_client,
        ip_proxy,
        vercel_country,
        vercel_region,
        vercel_city,
      }),
    });
  } catch {
    // noop
  }

  return res;
}

export const config = {
  matcher: ["/login", "/welcome"],
};