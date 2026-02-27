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

function pickClientIp(req: NextRequest) {
  const xff = (req.headers.get("x-forwarded-for") || "").trim();
  const xri = (req.headers.get("x-real-ip") || "").trim();
  const cfc = (req.headers.get("cf-connecting-ip") || "").trim();

  const first = xff.split(",")[0]?.trim();
  const ip_client = first || cfc || xri || null;

  // “プロキシ側”として保持（参考用）
  const ip_proxy = xri || cfc || null;

  return { xff: xff || null, ip_client, ip_proxy };
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
      httpOnly: false,
      sameSite: "lax",
      secure: true,
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  // 追加：IP候補を middleware 側で拾って API に渡す
  const { xff, ip_client, ip_proxy } = pickClientIp(req);

  // 監査ログPOST（失敗しても止めない）
  try {
    const url = new URL("/api/audit/access", req.url);
    const created_day = new Date(
      Date.now() + 9 * 60 * 60 * 1000
    ).toISOString().slice(0, 10);

    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        created_day,
        path: pathname,
        device_id: deviceId,

        // ★ここが本命：Edgeで見えてる “本当のクライアントIP候補” を渡す
        ip: ip_client,      // 互換用（既存ip列に入る想定）
        xff,
        ip_client,
        ip_proxy,
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