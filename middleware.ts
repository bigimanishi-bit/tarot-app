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

// ✅ JST 기준 YYYY-MM-DD を作る（EdgeでOK）
function jstDayString() {
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return jst.toISOString().slice(0, 10);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

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

  // ✅ 監査ログAPIへ（created_day を必ず送る）
  try {
    const origin = req.nextUrl.origin;

    await fetch(`${origin}/api/audit/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        path: pathname,
        device_id: deviceId,
        created_day: jstDayString(),
      }),
      // @ts-ignore
      keepalive: true,
    });
  } catch {
    // 失敗しても画面は止めない
  }

  return res;
}

export const config = {
  matcher: ["/login", "/welcome"],
};