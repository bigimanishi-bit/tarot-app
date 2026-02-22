"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { OccultShell } from "../components/OccultShell";

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        router.replace("/chat");
      }
    })();
  }, [router]);

  async function sendOtp() {
    setErr(null);
    setMsg(null);

    const e = email.trim().toLowerCase();
    if (!e) return;

    setSending(true);
    try {
      const { error } = await supabase.auth.signInWithOtp({
        email: e,
        options: {
          shouldCreateUser: true,
        },
      });

      if (error) throw error;

      setMsg("6桁コードをメールに送信しました。入力してください。");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSending(false);
    }
  }

  async function verifyOtp() {
    setErr(null);
    setMsg(null);

    const e = email.trim().toLowerCase();
    const code = otp.trim();
    if (!e || !code) return;

    setVerifying(true);
    try {
      const { error } = await supabase.auth.verifyOtp({
        email: e,
        token: code,
        type: "email",
      });

      if (error) throw error;

      router.replace("/chat");
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setVerifying(false);
    }
  }

  return (
    <OccultShell maxWidth="max-w-6xl">
      <div className="glass rounded-[28px] p-8 text-white">
        <h1 className="text-2xl font-semibold">ログイン</h1>

        {msg && <div className="mt-4 text-amber-300">{msg}</div>}
        {err && <div className="mt-4 text-red-400">{err}</div>}

        <div className="mt-6">
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="メールアドレス"
            className="field w-full rounded-2xl px-4 py-4 text-sm"
          />
        </div>

        <button
          onClick={sendOtp}
          disabled={sending}
          className="btn btnGold mt-4 rounded-2xl px-6 py-3"
        >
          {sending ? "送信中…" : "コード送信"}
        </button>

        <div className="mt-8">
          <input
            value={otp}
            onChange={(e) => setOtp(e.target.value)}
            placeholder="6桁コード"
            className="field w-full rounded-2xl px-4 py-4 text-sm"
          />
        </div>

        <button
          onClick={verifyOtp}
          disabled={verifying}
          className="btn btnGold mt-4 rounded-2xl px-6 py-3"
        >
          {verifying ? "確認中…" : "ログイン"}
        </button>
      </div>
    </OccultShell>
  );
}