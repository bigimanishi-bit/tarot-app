// app/login/page.tsx
"use client";

import React, { useMemo, useState } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const canSend = useMemo(() => {
    const v = email.trim();
    return v.includes("@") && v.includes(".");
  }, [email]);

  const canVerify = useMemo(() => {
    const c = code.trim();
    return c.length >= 6; // 6〜8桁想定（運用に合わせてOK）
  }, [code]);

  const handleSend = async () => {
    if (!canSend || loading) return;
    setLoading(true);
    setMessage(null);

    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
    });

    if (error) {
      setMessage("送信に失敗しました: " + error.message);
      setLoading(false);
      return;
    }

    setMessage("メールを送信しました。届いたコードを入力してください。");
    setStep("code");
    setLoading(false);
  };

  const handleVerify = async () => {
    if (!canSend || !canVerify || loading) return;
    setLoading(true);
    setMessage(null);

    const token = code.trim().replace(/\s/g, "");

    const { error } = await supabase.auth.verifyOtp({
      email: email.trim(),
      token,
      type: "email",
    });

    if (error) {
      setMessage("コードの確認に失敗しました: " + error.message);
      setLoading(false);
      return;
    }

    setMessage("ログインしました。移動します…");
    window.location.href = "/new";
  };

  const handleBack = () => {
    if (loading) return;
    setStep("email");
    setCode("");
    setMessage(null);
  };

  return (
    <main
      className="min-h-screen"
      style={{
        backgroundImage: "url(/assets/bg-okinawa-twilight.png)",
        backgroundSize: "cover",
        backgroundPosition: "center",
        backgroundRepeat: "no-repeat",
        backgroundAttachment: "fixed",
      }}
    >
      <div className="min-h-screen bg-black/10">
        <div className="mx-auto max-w-6xl px-6 py-10 md:py-14">
          <header className="mb-10 md:mb-12">
            <div className="inline-flex flex-col gap-3">
              <h1
                className="text-4xl md:text-6xl tracking-tight text-slate-900"
                style={{
                  fontFamily:
                    'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                }}
              >
                Tarot Studio
              </h1>
              <p className="text-sm md:text-base text-slate-700">
                カードの声を、あなたの言葉に。
              </p>
            </div>
          </header>

          <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl md:p-6">
            <div className="grid gap-6 md:grid-cols-2">
              {/* 左：コンセプト（元のまま） */}
              <div className="rounded-2xl border border-white/50 bg-white/68 p-6 shadow-sm">
                <div className="mb-5 flex items-center gap-3">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    Studio
                  </span>
                  <span className="text-sm text-slate-600">
                    カードの声を、あなたの言葉に。
                  </span>
                </div>

                <h2
                  className="text-3xl leading-tight text-slate-900 md:text-4xl"
                  style={{
                    fontFamily:
                      'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                  }}
                >
                  読むだけで終わらせない。
                  <br />
                  タロットのメッセージを、伝わる鑑定文に。
                </h2>

                <p className="mt-5 max-w-prose text-sm leading-7 text-slate-700 md:text-base">
                  Tarot Studio は、カードから受け取った感覚を整理して、
                  <br />
                  やさしく自然な言葉に整える“通訳”のためのスタジオです。
                </p>

                <div className="mt-7 space-y-4">
                  <Benefit
                    title="曖昧な読みを、伝わる文章に整える"
                    desc="感じたままを、読み手に届く言葉へ。"
                  />
                  <Benefit
                    title="複数枚でも意味がつながる"
                    desc="1枚ずつではなく、流れとして読みやすい。"
                  />
                  <Benefit
                    title="断定しすぎない表現に整う"
                    desc="やさしく、でも芯のある鑑定文に。"
                  />
                </div>

                <p className="mt-6 text-sm text-slate-600">
                  感じたままを、伝わる形に。
                </p>
              </div>

              {/* 右：ログイン（送信＋コード入力＋検証） */}
              <div className="rounded-2xl border border-white/50 bg-white/68 p-6 shadow-sm">
                <div className="mb-5 flex items-start justify-between gap-4">
                  <div>
                    <h3 className="text-xl font-bold text-slate-900">
                      ログインして、通訳をはじめる
                    </h3>
                    <p className="mt-2 text-sm text-slate-600">
                      メールにコードを送信します（すぐ届きます）
                    </p>
                  </div>
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    招待制
                  </span>
                </div>

                <label className="block text-sm font-semibold text-slate-800">
                  メールアドレス
                </label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
                  disabled={loading || step === "code"}
                />

                {step === "email" && (
                  <button
                    onClick={handleSend}
                    disabled={!canSend || loading}
                    className={[
                      "mt-5 w-full rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                      canSend
                        ? "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100"
                        : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                    ].join(" ")}
                  >
                    {loading ? "送信中..." : "コードを送る"}
                  </button>
                )}

                {step === "code" && (
                  <>
                    <div className="mt-5">
                      <label className="block text-sm font-semibold text-slate-800">
                        コード
                      </label>
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="メールのコードを入力"
                        className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-center text-lg tracking-[0.25em] text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
                        disabled={loading}
                      />
                    </div>

                    <button
                      onClick={handleVerify}
                      disabled={!canSend || !canVerify || loading}
                      className={[
                        "mt-5 w-full rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                        canSend && canVerify
                          ? "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100"
                          : "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400",
                      ].join(" ")}
                    >
                      {loading ? "確認中..." : "ログイン"}
                    </button>

                    <button
                      onClick={handleBack}
                      disabled={loading}
                      className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      type="button"
                    >
                      メール入力に戻る
                    </button>
                  </>
                )}

                {message && (
                  <p className="mt-3 text-sm text-slate-700">{message}</p>
                )}

                <p className="mt-3 text-xs text-slate-500">
                  招待されていないメールはログインできません。
                </p>

                <div className="mt-6 rounded-xl border border-slate-200 bg-white/70 p-4">
                  <p className="text-sm font-semibold text-slate-900">
                    できること
                  </p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-700">
                    <li>読みを整理して、文章の筋を通す</li>
                    <li>断定を避けて、やさしく伝える</li>
                    <li>複数枚でも流れとしてまとめる</li>
                  </ul>
                </div>
              </div>
            </div>
          </section>

          <div className="h-10" />
        </div>
      </div>
    </main>
  );
}

function Benefit({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-6 w-6 items-center justify-center rounded-full border border-amber-200 bg-amber-50 text-xs font-bold text-amber-700">
          ✓
        </span>
        <div>
          <p className="font-semibold text-slate-900">{title}</p>
          <p className="mt-1 text-sm text-slate-600">{desc}</p>
        </div>
      </div>
    </div>
  );
}