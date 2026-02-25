// app/login/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // ✅ ログイン済みなら login に留まらず welcome へ
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) router.replace("/welcome");
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const canSend = useMemo(() => {
    const v = email.trim();
    return v.includes("@") && v.includes(".");
  }, [email]);

  const canVerify = useMemo(() => {
    const c = code.trim().replace(/\s/g, "");
    return c.length >= 6;
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

    setMessage("ログインしました。Welcomeへ移動します…");
    router.replace("/welcome");
  };

  const handleBack = () => {
    if (loading) return;
    setStep("email");
    setCode("");
    setMessage(null);
  };

  return (
    <main className="min-h-screen">
      {/* 背景（夜空・高級感） */}
      <div className="relative min-h-screen overflow-hidden bg-[#0B1020]">
        {/* 深いグラデ */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 18% 22%, rgba(120,140,255,0.18), transparent 60%)," +
              "radial-gradient(900px 520px at 82% 30%, rgba(255,255,255,0.06), transparent 62%)," +
              "radial-gradient(1100px 700px at 50% 100%, rgba(0,0,0,0.55), transparent 60%)," +
              "linear-gradient(180deg, rgba(5,8,18,0.86) 0%, rgba(10,15,30,0.92) 35%, rgba(3,5,12,0.96) 100%)",
          }}
        />

        {/* 星（点だけ） */}
        <Stars />

        {/* うっすら霧 */}
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 450px at 30% 55%, rgba(255,255,255,0.05), transparent 60%)," +
              "radial-gradient(700px 360px at 70% 60%, rgba(255,255,255,0.035), transparent 58%)",
            filter: "blur(1px)",
          }}
        />

        {/* ✅ スクロールしても残るヘッダー（PC/モバイル共通） */}
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/55 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Link
                  href="/welcome"
                  className="inline-flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-white/5"
                  aria-label="Tarot Studio（Welcomeへ）"
                >
                  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white/80">
                    TS
                  </span>
                  <span
                    className="text-base font-semibold tracking-tight text-white md:text-lg"
                    style={{
                      fontFamily:
                        'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                    }}
                  >
                    Tarot Studio
                  </span>
                </Link>

                <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 sm:inline-flex">
                  招待制 / Invite only
                </span>
              </div>

              {/* 右側：最小情報だけ（モバイルでも邪魔しない） */}
              <div className="text-xs text-white/55">
                {step === "code" ? "コード入力" : ""}
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
          {/* 上部キャッチ（モバイル最適化） */}
          <header className="mb-6 md:mb-10">
            <h1
              className="text-4xl tracking-tight text-white md:text-6xl"
              style={{
                fontFamily:
                  'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                textShadow: "0 10px 40px rgba(0,0,0,0.55)",
              }}
            >
              Tarot Studio          
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-7 text-white/75 md:text-base">
              カードの声は、静か刺さる。<br className="hidden md:block" />
              “断定”より、腑に落ちる言葉選び。
            </p>
          </header>

          {/* メイン（ガラス） */}
          <section className="rounded-[30px] border border-white/12 bg-white/6 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-4 md:p-6">
            {/* ✅ モバイルは1カラム、md以上で2カラム */}
            <div className="grid gap-4 md:grid-cols-2 md:gap-6">
              {/* 左：世界観（モバイルでは少し短めに見えるサイズ） */}
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm md:p-6">
                <div className="mb-5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex h-2 w-2 rounded-full bg-white/70" />
                    <span className="text-xs font-semibold tracking-[0.18em] text-white/70">
                      PROFESSIONAL READING
                    </span>
                  </div>
                  <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/70">
                    静かな鑑定
                  </span>
                </div>

                <h2
                  className="text-2xl leading-tight text-white md:text-4xl"
                  style={{
                    fontFamily:
                      'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                  }}
                >
                  迷いを、<br />
                  “言葉”でほどく。
                </h2>

                <p className="mt-4 max-w-prose text-sm leading-7 text-white/70 md:mt-5 md:text-base">
                  Tarot Studio は、カードから受け取った気配を
                  その人の状況に合わせて、無理なく文章に整える場所。
                  <br className="hidden md:block" />
                  ユーザーに合わせた育つAI鑑定。
                </p>

                <div className="mt-5 grid gap-3 md:mt-6">
                  <Feature title="潜在意識に届く言葉づかい" desc="当てない。刺さる言い方を選ぶ。" />
                  <Feature title=" ユーザーのカルテを絶対に混ぜない" desc="似た境遇でも、その人として管理。" />
                  <Feature title="招待制のプライベート空間" desc="あなたの端末のログインだけが入口。" />
                </div>
              </div>

              {/* 右：ログイン（モバイル押しやすく） */}
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm md:p-6">
                <div className="mb-5">
                  <h3 className="text-2xl font-semibold text-white">入室</h3>
                  <p className="mt-2 text-sm text-white/65">
                    メールにコードを送ります。届いた合図で、扉が開きます。
                  </p>
                </div>

                <label className="block text-sm font-semibold text-white/80">メールアドレス</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                  disabled={loading || step === "code"}
                />

                {step === "email" && (
                  <button
                    onClick={handleSend}
                    disabled={!canSend || loading}
                    className={clsx(
                      "mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition md:mt-5",
                      canSend
                        ? "border-white/15 bg-white/10 text-white hover:bg-white/14"
                        : "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                    )}
                  >
                    {loading ? "送信中..." : "コードを送る"}
                  </button>
                )}

                {step === "code" && (
                  <>
                    <div className="mt-4 md:mt-5">
                      <label className="block text-sm font-semibold text-white/80">コード</label>
                      <input
                        value={code}
                        onChange={(e) => setCode(e.target.value)}
                        placeholder="メールのコードを入力"
                        className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center text-lg tracking-[0.25em] text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                        disabled={loading}
                      />
                    </div>

                    <button
                      onClick={handleVerify}
                      disabled={!canSend || !canVerify || loading}
                      className={clsx(
                        "mt-4 w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition md:mt-5",
                        canSend && canVerify
                          ? "border-white/15 bg-white/10 text-white hover:bg-white/14"
                          : "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                      )}
                    >
                      {loading ? "確認中..." : "ログイン"}
                    </button>

                    <button
                      onClick={handleBack}
                      disabled={loading}
                      className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white/75 shadow-sm hover:bg-white/8"
                      type="button"
                    >
                      メール入力に戻る
                    </button>
                  </>
                )}

                {message && <p className="mt-3 text-sm text-white/75">{message}</p>}

                <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 md:mt-6">
                  <p className="text-sm font-semibold text-white/85">はじめての人へ</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-white/65">
                    <li>ログイン後は Welcome で「本人/ ユーザー」を選びます</li>
                    <li>鑑定は個人カルテで完全分離（混ざりません）</li>
                    <li>完全招待制、招待されていないメールは入れません</li>
                  </ul>
                </div>

                <div className="mt-5 flex items-center justify-between text-xs text-white/45 md:mt-6">
                  <span>Tarot Studio / private beta</span>
                  <span>静かに、深く。</span>
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

function Feature({ title, desc }: { title: string; desc: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <div className="text-sm font-semibold text-white/85">{title}</div>
      <div className="mt-1 text-sm leading-6 text-white/65">{desc}</div>
    </div>
  );
}

function Stars() {
  return (
    <div
      className="pointer-events-none absolute inset-0 opacity-70"
      style={{
        backgroundImage:
          "radial-gradient(circle at 12% 18%, rgba(255,255,255,0.22) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 28% 46%, rgba(255,255,255,0.18) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 44% 22%, rgba(255,255,255,0.16) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 62% 18%, rgba(255,255,255,0.20) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 78% 32%, rgba(255,255,255,0.15) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 88% 58%, rgba(255,255,255,0.14) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 24% 78%, rgba(255,255,255,0.14) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 54% 82%, rgba(255,255,255,0.12) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 82% 86%, rgba(255,255,255,0.12) 0 1px, transparent 2px)," +
          "radial-gradient(circle at 18% 32%, rgba(255,255,255,0.22) 0 1.5px, transparent 3px)," +
          "radial-gradient(circle at 70% 48%, rgba(255,255,255,0.18) 0 1.5px, transparent 3px)," +
          "radial-gradient(circle at 40% 64%, rgba(255,255,255,0.16) 0 1.5px, transparent 3px)," +
          "radial-gradient(circle at 64% 28%, rgba(255,255,255,0.18) 0 2px, transparent 4px)",
        filter: "blur(0.2px)",
      }}
    />
  );
}