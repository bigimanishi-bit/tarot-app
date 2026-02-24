// app/new/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

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

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

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
        router.push("/login?reason=not_logged_in");
        return;
      }

      const email = session.user.email ?? null;
      if (!email) {
        await supabase.auth.signOut();
        router.push("/login?reason=no_email");
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
        router.push("/login?reason=invite_only");
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
      router.push("/login?reason=signed_out");
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
          {/* ヘッダー（loginと同じトーン） */}
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
                新規鑑定（New）
              </p>
              <p className="text-xs md:text-sm text-slate-600">
                {checkingAuth ? "ログイン確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
              </p>
            </div>
          </header>

          {/* エラー */}
          {err ? (
            <div className="mb-6 rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
              {err}
            </div>
          ) : null}

          {/* メイン（ガラス枠：loginと同系） */}
          <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl md:p-6">
            <div className="grid gap-6 lg:grid-cols-4">
              {/* 左：テンプレ＋設定 */}
              <aside className="lg:col-span-1 space-y-6">
                <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                  <div className="text-sm font-bold text-slate-900">テンプレ</div>
                  <div className="mt-3 space-y-2">
                    {PRESETS.map((p) => (
                      <button
                        key={p.key}
                        type="button"
                        onClick={() => setPresetKey(p.key)}
                        className={clsx(
                          "w-full rounded-2xl border px-4 py-3 text-left shadow-sm transition",
                          p.key === presetKey
                            ? "border-slate-300 bg-white"
                            : "border-slate-200 bg-white/80 hover:bg-white"
                        )}
                      >
                        <div className="text-xs font-semibold text-slate-900">{p.title}</div>
                        <div className="mt-1 text-[11px] leading-5 text-slate-600">{p.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                  <div className="text-sm font-bold text-slate-900">設定</div>

                  <div className="mt-4 space-y-4">
                    <div>
                      <div className="mb-2 text-xs font-semibold text-slate-700">デッキ</div>
                      <select
                        value={deckKey}
                        onChange={(e) => setDeckKey(e.target.value)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
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
                      <div className="mb-2 text-xs font-semibold text-slate-700">スプレッド</div>
                      <select
                        value={spread}
                        onChange={(e) => setSpread(e.target.value as SpreadKey)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
                      >
                        {SPREADS.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="mb-2 text-xs font-semibold text-slate-700">トーン</div>
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value as ToneKey)}
                        className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
                      >
                        <option value="warm">やわらかめ</option>
                        <option value="neutral">ニュートラル</option>
                        <option value="direct">はっきりめ</option>
                      </select>
                    </div>

                    <div className="text-xs text-slate-600">
                      今：
                      <span className="font-semibold text-slate-900"> {deckKey}</span> /{" "}
                      <span className="font-semibold text-slate-900">{spreadLabel}</span> /{" "}
                      <span className="font-semibold text-slate-900">{toneLabel}</span>
                    </div>
                  </div>
                </div>
              </aside>

              {/* 右：下書き */}
              <section className="lg:col-span-3">
                <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm sm:p-6">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <div className="text-sm font-bold text-slate-900">下書き</div>
                      <div className="mt-2 text-xs text-slate-600">
                        「Chatへ」で /chat に移動します（下書きは localStorage に保存）。
                      </div>
                    </div>

                    {/* 操作（loginと同じボタン感） */}
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={startChat}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-amber-100"
                      >
                        Chatへ
                      </button>
                      <Link
                        href="/read"
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        履歴
                      </Link>
                      <button
                        type="button"
                        onClick={copyDraft}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        コピー
                      </button>
                      <button
                        type="button"
                        onClick={logout}
                        className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        ログアウト
                      </button>
                    </div>
                  </div>

                  <div className="mt-4">
                    <textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={14}
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
                      placeholder="ここに下書きを書きます"
                    />
                  </div>

                  {/* 下にも同じ操作（スマホでも押しやすい） */}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={startChat}
                      className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-amber-100"
                    >
                      Chatへ
                    </button>
                    <Link
                      href="/read"
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      履歴
                    </Link>
                    <button
                      type="button"
                      onClick={copyDraft}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      コピー
                    </button>
                    <button
                      type="button"
                      onClick={logout}
                      className="rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                    >
                      ログアウト
                    </button>
                  </div>
                </div>
              </section>
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
    <div className="rounded-2xl border border-slate-200 bg-white/85 p-4">
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