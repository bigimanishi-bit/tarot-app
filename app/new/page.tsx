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
  { key: "one_card", label: "1枚（シンプル）" },
  { key: "two_choices", label: "2枚（A/B）" },
  { key: "past_present_future", label: "3枚（過去/現在/未来）" },
  { key: "four_situation", label: "4枚（状況/障害/対策/結果）" },
  { key: "five_cross", label: "5枚（クロス）" },
  { key: "five_feelings", label: "5枚（気持ち）" },
  { key: "six_relationship", label: "6枚（関係）" },
  { key: "seven_horseshoe", label: "7枚（ホースシュー）" },
  { key: "eight_workflow", label: "8枚（手順）" },
  { key: "nine_box", label: "9枚（ボックス）" },
  { key: "celtic_10", label: "10枚（ケルト十字）" },
  { key: "twelve_months", label: "12枚（12ヶ月）" },
  { key: "thirteen_full", label: "13枚（フル）" },
];

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const PRESETS = [
  {
    key: "love_5",
    title: "恋愛：相手の気持ち（5枚）",
    desc: "現状/本音/ブロック/行動/未来",
    spread: "five_feelings" as SpreadKey,
    tone: "direct" as ToneKey,
    // ✅ APIのcardsTextにそのまま投げる想定（「カード一覧」欄にユーザーが入力）
    text:
      "【恋愛】相手の気持ち\n" +
      "状況を簡潔に：\n\n" +
      "カード一覧（1〜5）：\n" +
      "1)\n2)\n3)\n4)\n5)\n\n" +
      "補足（あれば）：",
  },
  {
    key: "work_3",
    title: "仕事：現状/課題/アドバイス（3枚）",
    desc: "短く見たい時",
    spread: "past_present_future" as SpreadKey,
    tone: "neutral" as ToneKey,
    text:
      "【仕事】現状/課題/アドバイス\n\n" +
      "カード一覧（1〜3）：\n" +
      "1)\n2)\n3)\n\n" +
      "補足：",
  },
  {
    key: "simple_1",
    title: "1枚：今必要なメッセージ",
    desc: "サクッと",
    spread: "one_card" as SpreadKey,
    tone: "direct" as ToneKey,
    text:
      "【1枚】今必要なメッセージ\n\n" +
      "カード：\n" +
      "1)\n\n" +
      "補足：",
  },
];

type GenerateOk = { ok: true; text: string; prompt_updated_at?: string | null };
type GenerateNg = { ok: false; message?: string };
type GenerateResp = GenerateOk | GenerateNg;

export default function NewPage() {
  const router = useRouter();

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

  // ✅ 一時鑑定の結果（ここで完結）
  const [generating, setGenerating] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  const spreadLabel = useMemo(
    () => SPREADS.find((s) => s.key === spread)?.label ?? spread,
    [spread]
  );
  const toneLabel =
    tone === "warm" ? "やわらかめ" : tone === "neutral" ? "ニュートラル" : "はっきり";

  useEffect(() => {
    setDraft(preset.text);
    setSpread(preset.spread);
    setTone(preset.tone);
    setResultText(null);
  }, [preset.key]); // eslint-disable-line react-hooks/exhaustive-deps

  // 1) scope 必須
  useEffect(() => {
    const sc = loadScope();
    if (!isScopeReady(sc)) {
      router.replace("/welcome?reason=need_scope");
      return;
    }
    setScope(sc);
  }, [router]);

  // 2) auth + allowlist + deck
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

  async function copyText(s: string) {
    try {
      await navigator.clipboard.writeText(s);
    } catch {}
  }

  // ✅ 一時鑑定（AIから質問はしない）
  async function generateOnce() {
    setErr(null);
    setGenerating(true);
    setResultText(null);

    try {
      // theme/title は今の /api/generate の仕様に合わせる
      const theme = scopeLabel(scope); // 表示用でもOK
      const title = `New / ${deckKey} / ${spreadLabel} / ${toneLabel}`;

      // ✅ “質問しない”を cardsText に明示（readingGenerator側がプロンプトで抑制できる）
      const guard =
        "\n\n【ルール】AIはユーザーに追加質問をしない。鑑定文だけで完結させる。";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme,
          title,
          mode: "normal",
          cardsText: String(draft ?? "") + guard,
        }),
      });

      const data = (await res.json().catch(() => null)) as GenerateResp | null;

      if (!res.ok) {
        const msg = (data as any)?.message ?? `生成に失敗しました（${res.status}）`;
        throw new Error(msg);
      }
      if (!data || (data as any).ok !== true || typeof (data as any).text !== "string") {
        throw new Error("生成結果の形式が想定と違います（text が見つかりません）");
      }

      setResultText((data as GenerateOk).text);
    } catch (e: any) {
      setErr(e?.message ?? "生成に失敗しました");
      setResultText(null);
    } finally {
      setGenerating(false);
    }
  }

  // ✅ 補足疑問が出たときだけ Chatへ（相談文＋結果＋設定を引き継ぐ）
  function goChatWithContext() {
    try {
      localStorage.setItem(
        "tarot_chat_seed",
        JSON.stringify({
          deckKey,
          spread,
          tone,
          draft,
          createdAt: Date.now(),
          initialReadingText: resultText ?? null,
          scope,
        })
      );
    } catch {}
    router.push("/chat");
  }

  // ✅ ここで終わり（結果だけ消す／相談文は残す）
  function finishHere() {
    setResultText(null);
    setErr(null);
  }

  if (!scope) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
            <div className="text-sm text-white/70">準備中…</div>
            <div className="mt-2 text-lg font-semibold">
              Welcomeでスコープを選んでから来てください
            </div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B1020] text-white">
      {/* 背景 */}
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

      {/* header */}
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
                fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
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
              fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
              textShadow: "0 10px 40px rgba(0,0,0,0.55)",
            }}
          >
            New（ここで一時鑑定まで）
          </h1>
          <p className="mt-2 text-sm text-white/70 md:text-base">
            相談の入れ物 / {scopeLabel(scope)}
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

        <section className="rounded-[28px] border border-white/12 bg-white/6 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-4 md:p-6">
          <div className="grid gap-4 md:gap-6 lg:grid-cols-4">
            {/* 左：設定 */}
            <aside className="lg:col-span-1 space-y-4 md:space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm">
                <div className="flex items-center justify-between">
                  <div className="text-sm font-semibold text-white/90">プリセット</div>
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
                      <option value="direct">はっきり</option>
                    </select>
                  </div>

                  <div className="text-xs text-white/55">
                    現在：
                    <span className="font-semibold text-white/85"> {deckKey}</span> /{" "}
                    <span className="font-semibold text-white/85">{spreadLabel}</span> /{" "}
                    <span className="font-semibold text-white/85">{toneLabel}</span>
                  </div>
                </div>
              </div>
            </aside>

            {/* 右：相談＋結果 */}
            <section className="lg:col-span-3 space-y-4 md:space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm sm:p-6">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-sm font-semibold text-white/90">相談文</div>
                    <div className="mt-2 text-xs text-white/55">
                      ここで一時鑑定まで完結。補足疑問が出たときだけChatへ進みます。
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={generateOnce}
                      disabled={generating}
                      className={clsx(
                        "rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                        generating
                          ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                          : "border-white/15 bg-white/10 text-white hover:bg-white/14"
                      )}
                    >
                      {generating ? "鑑定中…" : "鑑定する（このページ）"}
                    </button>

                    <button
                      type="button"
                      onClick={() => copyText(draft)}
                      className="rounded-xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white/85 shadow-sm hover:bg-white/12"
                    >
                      下書きコピー
                    </button>
                  </div>
                </div>

                <div className="mt-4">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={14}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white/90 shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                    placeholder="ここに相談内容を書いてください"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-white/90">一時鑑定（結果）</div>
                    <div className="mt-1 text-xs text-white/55">
                      ここで終わりにもできます。補足疑問が出たらChatへ。
                    </div>
                  </div>

                  {resultText ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(resultText)}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                      >
                        結果コピー
                      </button>

                      <button
                        type="button"
                        onClick={finishHere}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                      >
                        ここで終わり
                      </button>

                      <button
                        type="button"
                        onClick={goChatWithContext}
                        className="rounded-xl border border-white/15 bg-white/10 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-white/14"
                      >
                        補足がある→Chatへ
                      </button>
                    </div>
                  ) : (
                    <span className="text-xs text-white/45">未生成</span>
                  )}
                </div>

                {!resultText ? (
                  <div className="mt-4 text-sm text-white/60">
                    「鑑定する（このページ）」を押すと、ここに結果が出ます。
                  </div>
                ) : (
                  <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/90">
                    {resultText}
                  </pre>
                )}

                <div className="mt-5 flex items-center justify-between text-xs text-white/45">
                  <span>Tarot Studio / private beta</span>
                  <span>静かに、深く。</span>
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