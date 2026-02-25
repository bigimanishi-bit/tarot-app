// middleware.ts
import { NextResponse, NextRequest, NextFetchEvent } from "next/server";

function isTargetPath(pathname: string) {
  return pathname === "/login" || pathname === "/welcome";
}

function getOrCreateDeviceId(req: NextRequest) {
  const existing = req.cookies.get("ts_device_id")?.value;
  if (existing) return { deviceId: existing, isNew: false };

  const deviceId = crypto.randomUUID();
  return { deviceId, isNew: true };
}

// ✅ JST 기준 YYYY-MM-DD
function jstDayString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

// ✅ ここで “本物のクライアントIP” を確定
function getClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;

  const realIp = req.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;

  return "";
}

export function middleware(req: NextRequest, ev: NextFetchEvent) {
  const { pathname, origin } = req.nextUrl;

  if (!isTargetPath(pathname)) {
    return NextResponse.next();
  }

  const { deviceId, isNew } = getOrCreateDeviceId(req);
  const res = NextResponse.next();

  if (isNew) {
    res.cookies.set("ts_device_id", deviceId, {
      httpOnly: false,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // ✅ 監査ログAPIへ（失敗しても絶対に画面を止めない）
  const url = `${origin}/api/audit/access`;

  const clientIp = getClientIp(req);

  // 送るのは最小限（body.ip を最優先にさせる）
  const headers: Record<string, string> = { "content-type": "application/json" };
  const ua = req.headers.get("user-agent");
  if (ua) headers["user-agent"] = ua;

  ev.waitUntil(
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        path: pathname,
        device_id: deviceId,
        created_day: jstDayString(),
        ip: clientIp || null,
      }),
    }).catch(() => {})
  );

  return res;
}

export const config = {
  matcher: ["/login", "/welcome"],
};