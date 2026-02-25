// app/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadScope, isScopeReady, scopeLabel, type TarotScope } from "@/lib/scope";

type ToneKey = "warm" | "neutral" | "direct";
type SpreadKey =
  | "one_card"
  | "two_choices"
  | "past_present_future"
  | "four_situation"
  | "five_cross"
  | "five_feelings"
  | "six_relationship"
  | "seven_horseshoe"
  | "eight_workflow"
  | "nine_box"
  | "celtic_10"
  | "twelve_months"
  | "thirteen_full";

type DeckRow = { key: string; name: string | null };
type SpreadDef = { key: SpreadKey; label: string };

const SPREADS: SpreadDef[] = [
  { key: "one_card", label: "1枚（要点）" },
  { key: "two_choices", label: "2枚（A/B）" },
  { key: "past_present_future", label: "3枚（過去/現在/近未来）" },
  { key: "four_situation", label: "4枚（現状/障害/助言/結果）" },
  { key: "five_cross", label: "5枚（現状/障害/過去/未来/結論）" },
  { key: "five_feelings", label: "5枚（表面/本音/ブレーキ/動く要因/近い流れ）" },
  { key: "six_relationship", label: "6枚（関係）" },
  { key: "seven_horseshoe", label: "7枚（ホースシュー）" },
  { key: "eight_workflow", label: "8枚（仕事/計画）" },
  { key: "nine_box", label: "9枚（3×3）" },
  { key: "celtic_10", label: "10枚（ケルト十字）" },
  { key: "twelve_months", label: "12枚（年間）" },
  { key: "thirteen_full", label: "13枚（年間＋総括）" },
];

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const PRESETS = [
  {
    key: "love_5",
    title: "恋愛：相手の気持ち（5枚）",
    desc: "表面/本音/ブレーキ/動く要因/近い流れ",
    spread: "five_feelings" as SpreadKey,
    tone: "direct" as ToneKey,
    text: "恋愛\n相手の気持ち\nカード\n1)\n2)\n3)\n4)\n5)\n\n追加:",
  },
  {
    key: "work_3",
    title: "仕事：現状/課題/助言（3枚）",
    desc: "迷ったときの定番",
    spread: "past_present_future" as SpreadKey,
    tone: "neutral" as ToneKey,
    text: "仕事\n現状/課題/助言\nカード\n1)\n2)\n3)\n\n条件: 断定しない/カード名ゼロ/最後に質問しない",
  },
  {
    key: "simple_1",
    title: "1枚：要点だけ",
    desc: "サクッと確認",
    spread: "one_card" as SpreadKey,
    tone: "direct" as ToneKey,
    text: "テーマ\nカード\n1)\n\n追加:",
  },
];

export default function NewPage() {
  const router = useRouter();

  // ✅ hooksは常に同じ順序
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [scope, setScope] = useState<TarotScope | null>(null);

  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deckKey, setDeckKey] = useState("rws");
  const [spread, setSpread] = useState<SpreadKey>("five_feelings");
  const [tone, setTone] = useState<ToneKey>("direct");

  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const preset = useMemo(
    () => PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0],
    [presetKey]
  );

  const [draft, setDraft] = useState(preset.text);
  const [err, setErr] = useState<string | null>(null);

  const spreadLabel = useMemo(
    () => SPREADS.find((s) => s.key === spread)?.label ?? spread,
    [spread]
  );

  const toneLabel =
    tone === "warm" ? "やわらかめ" : tone === "neutral" ? "ニュートラル" : "はっきりめ";

  useEffect(() => {
    setDraft(preset.text);
    setSpread(preset.spread);
    setTone(preset.tone);
  }, [preset.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // ✅ 1) scope確認（Welcomeで選んでないなら戻す）
  useEffect(() => {
    const sc = loadScope();
    if (!isScopeReady(sc)) {
      router.replace("/welcome?reason=need_scope");
      return;
    }
    setScope(sc);
  }, [router]);

  // ✅ 2) auth + allowlist + deck読み込み
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCheckingAuth(true);
      setErr(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setErr(sessionErr.message);
        setCheckingAuth(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      const email = session.user.email ?? null;
      if (!email) {
        await supabase.auth.signOut();
        router.replace("/login?reason=no_email");
        return;
      }

      const { data: allowedRows, error: allowErr } = await supabase
        .from("allowlist")
        .select("email")
        .eq("email", email)
        .eq("enabled", true)
        .limit(1);

      if (allowErr || !allowedRows?.[0]) {
        await supabase.auth.signOut();
        router.replace("/login?reason=invite_only");
        return;
      }

      setUserEmail(email);
      setCheckingAuth(false);

      const { data: deckRows } = await supabase
        .from("deck_library")
        .select("key, name")
        .order("name", { ascending: true });

      const list = (deckRows ?? []) as DeckRow[];
      setDecks(list);

      if (list.some((d) => d.key === "rws")) setDeckKey("rws");
      else if (list[0]?.key) setDeckKey(list[0].key);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  function startChat() {
    try {
      localStorage.setItem(
        "tarot_chat_seed",
        JSON.stringify({
          deckKey,
          spread,
          tone,
          draft,
          createdAt: Date.now(),
        })
      );
    } catch {}
    router.push("/chat");
  }

  async function copyDraft() {
    try {
      await navigator.clipboard.writeText(draft);
    } catch {}
  }

  // ✅ scopeがまだ決まってない間は簡易表示だけ（フラつき防止）
  if (!scope) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
            <div className="text-sm text-white/70">準備中…</div>
            <div className="mt-2 text-lg font-semibold">Welcomeの選択を確認しています</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B1020] text-white">
      {/* 背景（loginと同系統：夜空×霧×星） */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 18% 22%, rgba(120,140,255,0.18), transparent 60%)," +
              "radial-gradient(900px 520px at 82% 30%, rgba(255,255,255,0.06), transparent 62%)," +
              "radial-gradient(1100px 700px at 50% 100%, rgba(0,0,0,0.55), transparent 60%)," +
              "linear-gradient(180deg, rgba(5,8,18,0.86) 0%, rgba(10,15,30,0.92) 35%, rgba(3,5,12,0.96) 100%)",
          }}
        />
        <Stars />
        <div
          className="absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 450px at 30% 55%, rgba(255,255,255,0.05), transparent 60%)," +
              "radial-gradient(700px 360px at 70% 60%, rgba(255,255,255,0.035), transparent 58%)",
            filter: "blur(1px)",
          }}
        />
      </div>

      {/* sticky header（スクロールしても残る） */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
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

          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/70 md:inline-flex">
              {scopeLabel(scope)}
            </span>

            <Link
              href="/welcome"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
              title="切り替えはWelcomeで"
            >
              Welcome（切替）
            </Link>

            <Link
              href="/read"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              履歴
            </Link>

            <button
              type="button"
              onClick={logout}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-5 md:mb-7">
          <h1
            className="text-3xl tracking-tight text-white md:text-5xl"
            style={{
              fontFamily:
                'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
              textShadow: "0 10px 40px rgba(0,0,0,0.55)",
            }}
          >
            New
          </h1>
          <p className="mt-2 text-sm text-white/70 md:text-base">
            新規鑑定 / {scopeLabel(scope)}
          </p>
          <p className="mt-1 text-xs text-white/50">
            {checkingAuth ? "ログイン確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
          </p>
        </header>

        {err ? (
          <div className="mb-5 rounded-2xl border border-rose-200/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 backdrop-blur-2xl">
            {err}
          </div>
        ) : null}

        {/* メイン：ガラス */}
        <section className="rounded-[28px] border border-white/12 bg-white/6 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-4 md:p-6">
          <div className="grid gap-4 md:gap-6 lg:grid-cols-4">
            {/* 左：テンプレ＋設定 */}
            <aside className="lg:col-span-1 space-y-4 md:space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/90">テンプレ</div>
                  <span className="text-[11px] font-semibold text-white/45">PRESET</span>
                </div>

                <div className="mt-3 space-y-2">
                  {PRESETS.map((p) => (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPresetKey(p.key)}
                      className={clsx(
                        "w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition",
                        p.key === presetKey
                          ? "border-white/18 bg-white/12"
                          : "border-white/10 bg-white/6 hover:bg-white/10"
                      )}
                    >
                      <div className="text-xs font-semibold text-white/90">{p.title}</div>
                      <div className="mt-1 text-[11px] leading-5 text-white/60">{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/90">設定</div>
                  <span className="text-[11px] font-semibold text-white/45">CONFIG</span>
                </div>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-white/70">デッキ</div>
                    <select
                      value={deckKey}
                      onChange={(e) => setDeckKey(e.target.value)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 shadow-sm outline-none focus:border-white/20"
                    >
                      {decks.length === 0 ? <option value="rws">rws</option> : null}
                      {decks.map((d) => (
                        <option key={d.key} value={d.key}>
                          {d.name ?? d.key}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold text-white/70">スプレッド</div>
                    <select
                      value={spread}
                      onChange={(e) => setSpread(e.target.value as SpreadKey)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 shadow-sm outline-none focus:border-white/20"
                    >
                      {SPREADS.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold text-white/70">トーン</div>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as ToneKey)}
                      className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 shadow-sm outline-none focus:border-white/20"
                    >
                      <option value="warm">やわらかめ</option>
                      <option value="neutral">ニュートラル</option>
                      <option value="direct">はっきりめ</option>
                    </select>
                  </div>

                  <div className="text-xs text-white/55">
                    今：<span className="font-semibold text-white/85">{deckKey}</span> /{" "}
                    <span className="font-semibold text-white/85">{spreadLabel}</span> /{" "}
                    <span className="font-semibold text-white/85">{toneLabel}</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* 右：下書き */}
            <section className="lg:col-span-3">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white/90">下書き</div>
                    <div className="mt-2 text-xs text-white/55">
                      「Chatへ」で /chat に移動（下書きは localStorage に保存）
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={startChat}
                      className="rounded-xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-white/14"
                    >
                      Chatへ
                    </button>

                    <button
                      type="button"
                      onClick={copyDraft}
                      className="rounded-xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white/85 shadow-sm hover:bg-white/12"
                    >
                      コピー
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={14}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white/90 shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                    placeholder="ここに下書きを書きます"
                  />
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 text-xs text-white/45">
                  <span>Tarot Studio / private beta</span>
                  <span>切り替えは Welcome のみ（混ざり防止）</span>
                </div>
              </div>
            </section>
          </div>
        </section>

        <div className="h-10" />
      </div>
    </main>
  );
}

function Stars() {
  return (
    <div
      className="absolute inset-0 opacity-70"
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