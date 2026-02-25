
// middleware.ts
import { NextResponse, NextRequest } from "next/server";

function isTargetPath(pathname: string) {
  return pathname === "/login" || pathname === "/welcome";
}

function getOrCreateDeviceId(req: NextRequest) {
  const existing = req.cookies.get("ts_device_id")?.value;
  if (existing) return { deviceId: existing, isNew: false };

  // Edgeでも使えるUUID生成
  const deviceId = crypto.randomUUID();
  return { deviceId, isNew: true };
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 対象外は何もしない
  if (!isTargetPath(pathname)) {
    return NextResponse.next();
  }

  const { deviceId, isNew } = getOrCreateDeviceId(req);

  // レスポンス準備
  const res = NextResponse.next();

  // cookie無ければ付与（1年）
  if (isNew) {
    res.cookies.set("ts_device_id", deviceId, {
      httpOnly: false, // クライアントからも読める（必要なら）
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // 監査ログAPIへ（1日1回はDB側で制御）
  // ※middlewareはEdge → APIはnodejs。ここは fetch でOK。
  try {
    const origin = req.nextUrl.origin;

    // keepalive で遷移を邪魔しない（対応環境のみ）
    await fetch(`${origin}/api/audit/access`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path: pathname, device_id: deviceId }),
      // @ts-ignore
      keepalive: true,
    });
  } catch {
    // ログ失敗しても画面を止めない
  }

  return res;
}

export const config = {
  matcher: ["/login", "/welcome"],
};