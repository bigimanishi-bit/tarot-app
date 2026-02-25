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

  // IP推定に必要なヘッダだけ渡す（Vercel想定）
  const headers: Record<string, string> = { "content-type": "application/json" };
  const xff = req.headers.get("x-forwarded-for");
  if (xff) headers["x-forwarded-for"] = xff;
  const realIp = req.headers.get("x-real-ip");
  if (realIp) headers["x-real-ip"] = realIp;
  const ua = req.headers.get("user-agent");
  if (ua) headers["user-agent"] = ua;
  const al = req.headers.get("accept-language");
  if (al) headers["accept-language"] = al;

  ev.waitUntil(
    fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        path: pathname,
        device_id: deviceId, // ← snakeで統一
      }),
    }).catch(() => {})
  );

  return res;
}

export const config = {
  matcher: ["/login", "/welcome"],
};