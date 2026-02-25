
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

function pickClientIp(req: NextRequest) {
  const xff = req.headers.get("x-forwarded-for") || "";
  const first = xff.split(",")[0]?.trim();
  if (first) return first;

  const xri = req.headers.get("x-real-ip")?.trim();
  if (xri) return xri;

  // 取れない環境もあるので空で返す（API側でunknown化される）
  return "";
}

export async function middleware(req: NextRequest, event: NextFetchEvent) {
  const { pathname } = req.nextUrl;

  if (!isTargetPath(pathname)) {
    return NextResponse.next();
  }

  const { deviceId, isNew } = getOrCreateDeviceId(req);
  const clientIp = pickClientIp(req);

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

  // 監査ログ送信（画面遷移を待たない）
  try {
    const origin = req.nextUrl.origin;

    event.waitUntil(
      fetch(`${origin}/api/audit/access`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          path: pathname,
          device_id: deviceId,
          ip: clientIp, // ← これが重要
        }),
        // @ts-ignore
        keepalive: true,
      }).catch(() => {
        // 失敗しても画面は止めない
      })
    );
  } catch {
    // 失敗しても画面は止めない
  }

  return res;
}

export const config = {
  matcher: ["/login", "/welcome"],
};