// app/login/page.tsx
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

export default function LoginPage() {
  const router = useRouter();
  const sp = useSearchParams();

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<string | null>(null);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) router.replace("/new");
    })();
  }, [router]);

  async function sendLink() {
    const e = email.trim();
    if (!e || sending) return;

    setSending(true);
    setStatus(null);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          // ✅ ローカルでも本番でもOK（その時の origin を使う）
          emailRedirectTo: `${window.location.origin}/new`,
        },
      });
      if (error) throw new Error(error.message);
      setStatus("確認メールを送信しました。メールのリンクを開いてください。");
    } catch (err: any) {
      setStatus(`ERROR: ${err?.message ?? "login error"}`);
    } finally {
      setSending(false);
    }
  }

  const reason = sp.get("reason");

  return (
    <main className="min-h-screen text-white flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-white/15 bg-black/40 p-6 shadow-[0_30px_120px_rgba(0,0,0,.65)]">
        <div className="text-xs tracking-[.18em] text-white/60">Tarot Studio</div>
        <h1 className="mt-3 text-2xl font-semibold">ログイン</h1>

        {reason ? (
          <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/70">
            reason: {reason}
          </div>
        ) : null}

        <div className="mt-5 text-sm text-white/80">メールアドレスにマジックリンクを送ります。</div>

        <input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="mt-3 w-full rounded-2xl border border-white/15 bg-black/30 px-4 py-3 text-sm text-white outline-none"
        />

        <button
          type="button"
          onClick={sendLink}
          disabled={sending || !email.trim()}
          className="mt-4 w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"
        >
          {sending ? "送信中…" : "ログインリンク送信"}
        </button>

        {status ? (
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-white/80">
            {status}
          </div>
        ) : null}

        <div className="mt-4 text-[11px] text-white/45">
          招待制の判定は /new /chat /read 側で行います。
        </div>
      </div>
    </main>
  );
}