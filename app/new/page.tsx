"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { OccultShell } from "../components/OccultShell";

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
  const preset = useMemo(() => PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0], [presetKey]);

  const [draft, setDraft] = useState(preset.text);
  const [err, setErr] = useState<string | null>(null);

  const spreadLabel = useMemo(() => SPREADS.find((s) => s.key === spread)?.label ?? spread, [spread]);
  const toneLabel = tone === "warm" ? "やわらかめ" : tone === "neutral" ? "ニュートラル" : "はっきりめ";

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

      const { data: deckRows } = await supabase.from("deck_library").select("key, name").order("name", { ascending: true });

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
    <OccultShell maxWidth="max-w-6xl">
      <div className="mb-5 flex items-center justify-end gap-2">
        <Link href="/chat" className="pill rounded-full px-4 py-2 text-xs text-white/80 hover:text-white">
          Chat ＞
        </Link>
        <Link href="/read" className="pill rounded-full px-4 py-2 text-xs text-white/80 hover:text-white">
          履歴 ＞
        </Link>
        <button type="button" onClick={logout} className="pill rounded-full px-4 py-2 text-xs text-white/80 hover:text-white">
          ログアウト
        </button>
      </div>

      <div className="goldEdge glass rounded-[28px] p-5 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <div className="flex items-center gap-3">
              <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[11px] tracking-[.18em] text-white/80">
                COSMIC TAROT
              </span>
              <span className="text-[12px] text-white/45">New</span>
            </div>

            <h1 className="heroTitle mt-4 text-2xl sm:text-3xl font-semibold">新規鑑定</h1>
            <div className="mt-3 text-sm text-white/70">
              {checkingAuth ? "ログイン確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
            </div>
          </div>

          {/* ✅ ボタン整理：被りを消して短く */}
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={startChat} className="btn btnGold rounded-2xl px-5 py-3 text-sm font-semibold">
              Chatへ
            </button>
            <button type="button" onClick={copyDraft} className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
              コピー
            </button>
            <button type="button" onClick={logout} className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
              ログアウト
            </button>
          </div>
        </div>

        {err ? (
          <div className="mt-5 goldEdge glass rounded-[18px] p-3 text-sm text-red-100">
            <div className="text-red-200/90">ERROR</div>
            <div className="mt-1 text-red-100/90">{err}</div>
          </div>
        ) : null}

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-4">
          <aside className="lg:col-span-1 space-y-4">
            <div className="goldEdge glass rounded-[24px] p-4">
              <div className="text-sm font-semibold text-white/90">テンプレ</div>
              <div className="mt-3 space-y-2">
                {PRESETS.map((p) => (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPresetKey(p.key)}
                    className={clsx("btn w-full rounded-2xl px-3 py-3 text-left", p.key === presetKey ? "border-white/30 bg-white/10" : "")}
                  >
                    <div className="text-xs text-white/90 font-semibold">{p.title}</div>
                    <div className="mt-1 text-[11px] text-white/55 leading-5">{p.desc}</div>
                  </button>
                ))}
              </div>
            </div>

            <div className="goldEdge glass rounded-[24px] p-4">
              <div className="text-sm font-semibold text-white/90">設定</div>

              <div className="mt-3 space-y-3">
                <div>
                  <div className="mb-2 text-xs text-white/60">デッキ</div>
                  <select value={deckKey} onChange={(e) => setDeckKey(e.target.value)} className="field w-full rounded-2xl px-4 py-3 text-sm text-white">
                    {decks.length === 0 ? <option value="rws">rws</option> : null}
                    {decks.map((d) => (
                      <option key={d.key} value={d.key}>
                        {d.name ?? d.key}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs text-white/60">スプレッド</div>
                  <select value={spread} onChange={(e) => setSpread(e.target.value as SpreadKey)} className="field w-full rounded-2xl px-4 py-3 text-sm text-white">
                    {SPREADS.map((s) => (
                      <option key={s.key} value={s.key}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <div className="mb-2 text-xs text-white/60">トーン</div>
                  <select value={tone} onChange={(e) => setTone(e.target.value as ToneKey)} className="field w-full rounded-2xl px-4 py-3 text-sm text-white">
                    <option value="warm">やわらかめ</option>
                    <option value="neutral">ニュートラル</option>
                    <option value="direct">はっきりめ</option>
                  </select>
                </div>

                <div className="text-xs text-white/55">
                  今：<span className="text-white/85">{deckKey}</span> / <span className="text-white/85">{spreadLabel}</span> /{" "}
                  <span className="text-white/85">{toneLabel}</span>
                </div>
              </div>
            </div>
          </aside>

          <section className="lg:col-span-3">
            <div className="goldEdge glass rounded-[26px] p-5 sm:p-6">
              <div className="text-sm font-semibold text-white/90">下書き</div>
              <div className="mt-3 text-xs text-white/55">「Chatへ」で /chat に移動します（下書きは localStorage に保存）。</div>

              <div className="mt-4">
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={14}
                  className="field w-full resize-none rounded-2xl px-4 py-4 text-sm leading-7 text-white placeholder:text-white/35"
                />
              </div>

              {/* ✅ 下のボタンも被り消し */}
              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={startChat} className="btn btnGold rounded-2xl px-6 py-3 text-sm font-semibold">
                  Chatへ
                </button>
                <button type="button" onClick={copyDraft} className="btn rounded-2xl px-6 py-3 text-sm text-white/90">
                  コピー
                </button>
                <button type="button" onClick={logout} className="btn rounded-2xl px-6 py-3 text-sm text-white/90">
                  ログアウト
                </button>
              </div>
            </div>
          </section>
        </div>
      </div>
    </OccultShell>
  );
}