// app/quick/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadScope, isScopeReady, scopeLabel, type TarotScope } from "@/lib/scope";

type ToneKey = "warm" | "neutral" | "direct";
type SpreadKey = "one_card" | "three_cards";

type GenerateOk = { ok: true; text: string; prompt_updated_at?: string | null };
type GenerateNg = { ok: false; message?: string };
type GenerateResp = GenerateOk | GenerateNg;

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

const RWS_NAMES: string[] = [
  "The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers",
  "The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance",
  "The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World",
  "Ace of Cups","Two of Cups","Three of Cups","Four of Cups","Five of Cups","Six of Cups","Seven of Cups",
  "Eight of Cups","Nine of Cups","Ten of Cups","Page of Cups","Knight of Cups","Queen of Cups","King of Cups",
  "Ace of Wands","Two of Wands","Three of Wands","Four of Wands","Five of Wands","Six of Wands","Seven of Wands",
  "Eight of Wands","Nine of Wands","Ten of Wands","Page of Wands","Knight of Wands","Queen of Wands","King of Wands",
  "Ace of Swords","Two of Swords","Three of Swords","Four of Swords","Five of Swords","Six of Swords","Seven of Swords",
  "Eight of Swords","Nine of Swords","Ten of Swords","Page of Swords","Knight of Swords","Queen of Swords","King of Swords",
  "Ace of Pentacles","Two of Pentacles","Three of Pentacles","Four of Pentacles","Five of Pentacles","Six of Pentacles","Seven of Pentacles",
  "Eight of Pentacles","Nine of Pentacles","Ten of Pentacles","Page of Pentacles","Knight of Pentacles","Queen of Pentacles","King of Pentacles",
];

function slugifyCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/’/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function cardImageSrc(name: string): string {
  return `/cards/rws/${slugifyCardName(name)}.jpg`;
}
function pickUnique(arr: string[], n: number) {
  const copy = [...arr];
  const out: string[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

export default function QuickPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [spread, setSpread] = useState<SpreadKey>("one_card");
  const [tone, setTone] = useState<ToneKey>("direct");

  const [question, setQuestion] = useState("");
  const [cards, setCards] = useState<string[] | null>(null);

  const [generating, setGenerating] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  // auth + scope
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setErr(null);

      const sc = loadScope();
      if (!isScopeReady(sc)) {
        router.replace("/welcome?reason=need_scope");
        return;
      }
      setScope(sc);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setErr(sessionErr.message);
        setBooting(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      setBooting(false);
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

  function drawCards() {
    setErr(null);
    setResultText(null);
    const n = spread === "one_card" ? 1 : 3;
    setCards(pickUnique(RWS_NAMES, n));
  }

  function buildCardsText(): string {
    const q = question.trim();
    const picked = cards ?? [];
    if (spread === "one_card") {
      const c1 = picked[0] ?? "";
      return ["【AI】", q ? `状況：${q}` : "状況：", `カード：${c1}`].join("\n");
    } else {
      const c1 = picked[0] ?? "";
      const c2 = picked[1] ?? "";
      const c3 = picked[2] ?? "";
      return [
        "【AI】",
        q ? `状況：${q}` : "状況：",
        `現状：${c1}`,
        `課題：${c2}`,
        `助言：${c3}`,
      ].join("\n");
    }
  }

  async function generate() {
    if (!scope) return;
    if (!cards || cards.length === 0) {
      setErr("先に引いてください");
      return;
    }

    setErr(null);
    setGenerating(true);
    setResultText(null);

    try {
      const theme = scopeLabel(scope);
      const guard =
        "\n\n【ルール】AIはユーザーに追加質問をしない。鑑定文だけで完結させる。";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme,
          title: "AI",
          mode: "normal",
          cardsText: buildCardsText() + guard,
        }),
      });

      const data = (await res.json().catch(() => null)) as GenerateResp | null;

      if (!res.ok) {
        const msg = (data as any)?.message ?? `生成に失敗しました（${res.status}）`;
        throw new Error(msg);
      }
      if (!data || (data as any).ok !== true || typeof (data as any).text !== "string") {
        throw new Error("生成結果が不正です");
      }

      setResultText((data as GenerateOk).text);
    } catch (e: any) {
      setErr(e?.message ?? "生成に失敗しました");
      setResultText(null);
    } finally {
      setGenerating(false);
    }
  }

  function copyText(s: string) {
    navigator.clipboard.writeText(s).catch(() => {});
  }

  const box =
    "rounded-[26px] border border-white/12 bg-white/6 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl";

  const selectClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 shadow-sm outline-none focus:border-white/20";

  if (booting || !scope) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <div className={clsx(box, "p-6")}>
            <div className="text-sm text-white/70">準備中…</div>
          </div>
        </div>
      </main>
    );
  }

  const canGo = !!cards?.length;

  return (
    <main className="min-h-screen bg-[#0B1020] text-white">
      {/* ✅ layout触らずに option白問題を潰す（このページだけ） */}
      <style jsx global>{`
        select { color-scheme: dark; }
        select option {
          background: #0b1020 !important;
          color: rgba(255,255,255,0.92) !important;
        }
      `}</style>

      {/* background */}
      <div className="pointer-events-none fixed inset-0">
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 18% 22%, rgba(120,140,255,0.18), transparent 60%)," +
              "radial-gradient(900px 520px at 82% 30%, rgba(255,255,255,0.06), transparent 62%)," +
              "linear-gradient(180deg, rgba(5,8,18,0.86) 0%, rgba(10,15,30,0.92) 35%, rgba(3,5,12,0.96) 100%)",
          }}
        />
      </div>

      {/* header */}
      <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/60 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 md:px-6">
          <Link
  href="/welcome"
  className="inline-flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-white/5"
  aria-label="Home"
>
  <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white/80">
    TS
  </span>

  <span className="text-lg font-semibold tracking-tight text-white md:text-xl">
    Tarot Studio
  </span>
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

      {/* content */}
      <div className="relative mx-auto max-w-6xl px-4 py-6 pb-28 md:px-6 md:py-10 md:pb-32">
        <header className="mb-4">
      <h1 className="text-2xl tracking-tight text-white md:text-4xl">
  AI鑑定
</h1>
          <div className="mt-1 text-xs text-white/55">選択：{scopeLabel(scope)}</div>
        </header>

        {err ? (
          <div className="mb-4 rounded-2xl border border-rose-200/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 backdrop-blur-2xl">
            {err}
          </div>
        ) : null}

        <section className={clsx(box, "p-4 md:p-6")}>
          <div className="grid gap-4 lg:grid-cols-4 lg:gap-6">
            {/* config */}
            <aside className="lg:col-span-1 space-y-4">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-sm font-semibold text-white/90">設定</div>

                <div className="mt-4 space-y-4">
                  <div>
                    <div className="mb-2 text-xs font-semibold text-white/70">枚数</div>
                    <select
                      value={spread}
                      onChange={(e) => {
                        setSpread(e.target.value as SpreadKey);
                        setCards(null);
                        setResultText(null);
                      }}
                      className={selectClass}
                    >
                      <option value="one_card">1枚</option>
                      <option value="three_cards">3枚</option>
                    </select>
                  </div>

                  <div>
                    <div className="mb-2 text-xs font-semibold text-white/70">鑑定強度</div>
                    <select value={tone} onChange={(e) => setTone(e.target.value as ToneKey)} className={selectClass}>
                      <option value="warm">やわらかめ</option>
                      <option value="neutral">ふつう</option>
                      <option value="direct">はっきり</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={drawCards}
                    className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-white/14"
                  >
                    カードを選ぶ
                  </button>
                </div>
              </div>
            </aside>

            {/* main */}
            <section className="lg:col-span-3 space-y-4 md:space-y-6">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white/90">相談内容入力</div>
                  {question.trim() ? (
                    <button
                      type="button"
                      onClick={() => copyText(question)}
                      className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                    >
                      コピー
                    </button>
                  ) : null}
                </div>

                <div className="mt-4">
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white/90 shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                    placeholder="例：今日は流れを良くしたい。いま何を意識するといい？／恋愛で一歩進めたい"
                  />
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white/90">指針</div>

                  <div className="flex items-center gap-2">
                    {cards?.length ? (
                      <button
                        type="button"
                        onClick={() => copyText(cards.join(" / "))}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                      >
                        コピー
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={drawCards}
                      className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                    >
                      選び直す
                    </button>
                  </div>
                </div>

                {!cards ? (
                  <div className="mt-4 text-sm text-white/60">「カードを選ぶ」でカードが出ます</div>
                ) : (
                  <div className={clsx("mt-4 grid gap-3", cards.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
                    {cards.map((name, i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-black/20 py-3">
                          <img
                            src={cardImageSrc(name)}
                            alt={name}
                            className="h-[160px] w-[110px] object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-white/75">{name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-semibold text-white/90">鑑定結果</div>
                  {resultText ? (
                    <button
                      type="button"
                      onClick={() => copyText(resultText)}
                      className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                    >
                      コピー
                    </button>
                  ) : (
                    <span className="text-xs text-white/45">—</span>
                  )}
                </div>

                {!resultText ? null : (
                  <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/90">
                    {resultText}
                  </pre>
                )}
              </div>
            </section>
          </div>
        </section>
      </div>

      {/* bottom fixed CTA */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
        <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={generate}
              disabled={!canGo || generating}
              className={clsx(
                "rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm transition",
                !canGo || generating
                  ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                  : "border-white/18 bg-white/14 text-white hover:bg-white/18"
              )}
            >
              {generating ? "鑑定中…" : "鑑定する"}
            </button>

            <Link
              href="/welcome"
              className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/85 hover:bg-white/12"
            >
              ホームに戻る
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}