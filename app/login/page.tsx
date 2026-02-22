"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { OccultShell } from "../components/OccultShell";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function reasonText(reason: string | null) {
  if (!reason) return null;
  if (reason === "not_logged_in") return "ログインが必要です。";
  if (reason === "invite_only") return "招待（allowlist）されたメールのみ利用できます。";
  if (reason === "no_email") return "メール情報が取得できませんでした。もう一度ログインしてください。";
  if (reason === "signed_out") return "ログアウトしました。";
  return "認証が必要です。";
}

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const reason = sp.get("reason");
  const banner = useMemo(() => reasonText(reason), [reason]);

  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState<"login" | "signup" | null>(null);
  const [msg, setMsg] = useState<string | null>(banner);
  const [err, setErr] = useState<string | null>(null);

  // すでにログイン済みなら /chat へ
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setChecking(true);
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        router.replace("/chat");
        return;
      }
      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function sendLink(mode: "login" | "signup") {
    setErr(null);
    setMsg(null);

    const e = email.trim().toLowerCase();
    if (!e || sending) return;

    setSending(mode);
    try {
      // ✅ 招待制：allowlist（enabled=true）を “limit(1)” で安全に確認
      const { data: allowedRows, error: allowErr } = await supabase
        .from("allowlist")
        .select("email")
        .eq("email", e)
        .eq("enabled", true)
        .limit(1);

      if (allowErr || !allowedRows?.[0]) {
        setErr("このメールは招待されていません（allowlist未登録）。");
        return;
      }

      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: { emailRedirectTo: `${location.origin}/chat` },
      });

      if (error) throw error;

      setMsg(
        mode === "login"
          ? "ログインリンクを送信しました。メールを開いてログインしてください。"
          : "新規登録（招待制）リンクを送信しました。メールを開いて登録/ログインしてください。"
      );
    } catch (e: any) {
      setErr(e?.message ?? "auth error");
    } finally {
      setSending(null);
    }
  }

  return (
    <OccultShell maxWidth="max-w-3xl">
      <div className="goldEdge glass rounded-[28px] p-6 sm:p-8">
        <div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[11px] tracking-[.18em] text-white/80">
              COSMIC TAROT
            </span>
            <span className="text-[12px] text-white/45">Login</span>
          </div>

          <h1 className="heroTitle mt-4 text-2xl sm:text-3xl font-semibold">ログイン</h1>
          <div className="mt-3 text-sm text-white/70">
            {checking ? "確認中…" : "招待（allowlist）されたメールのみ利用できます。"}
          </div>
        </div>

        {msg ? <div className="mt-5 goldEdge glass rounded-[18px] p-3 text-sm text-amber-50">{msg}</div> : null}

        {err ? (
          <div className="mt-5 goldEdge glass rounded-[18px] p-3 text-sm text-red-100">
            <div className="text-red-200/90">ERROR</div>
            <div className="mt-1 text-red-100/90">{err}</div>
          </div>
        ) : null}

        <div className="mt-7 goldEdge glass rounded-[26px] p-5 sm:p-6">
          <div className="text-sm font-semibold text-white/90">メール</div>

          <div className="mt-4">
            <input
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="you@example.com"
              className="field w-full rounded-2xl px-4 py-4 text-sm leading-7 text-white placeholder:text-white/35"
              inputMode="email"
              autoComplete="email"
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => sendLink("login")}
              disabled={!!sending || !email.trim()}
              className={clsx("btn btnGold rounded-2xl px-7 py-4 text-sm font-semibold", "disabled:opacity-50 disabled:cursor-not-allowed")}
            >
              {sending === "login" ? "送信中…" : "ログイン"}
            </button>

            <button
              type="button"
              onClick={() => sendLink("signup")}
              disabled={!!sending || !email.trim()}
              className={clsx("btn rounded-2xl px-7 py-4 text-sm text-white/90", "disabled:opacity-50 disabled:cursor-not-allowed")}
            >
              {sending === "signup" ? "送信中…" : "新規登録"}
            </button>
          </div>

          <div className="mt-2 text-xs text-white/55">メールが届かない場合：迷惑メール/プロモーションも確認してね。</div>
        </div>
      </div>
    </OccultShell>
  );
}