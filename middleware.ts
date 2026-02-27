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

        // 互換用
        ip: ip_client,

        // IP切り分け
        xff,
        ip_client,
        ip_proxy,

        // Vercel Geo
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