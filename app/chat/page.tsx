// app/chat/page.tsx
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ToneKey = "warm" | "neutral" | "direct";

type DeckRow = {
  key: string;
  name: string | null;
};

type ChatMsg = {
  role: "user" | "assistant";
  content: string;
};

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

function nowTitle() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function buildCardsText(deckKey: string, spread: string, tone: string, msgs: ChatMsg[]) {
  const lines: string[] = [];
  lines.push(`deck=${deckKey}`);
  lines.push(`spread=${spread}`);
  lines.push(`tone=${tone}`);
  lines.push("");
  lines.push("messages:");
  msgs.forEach((m, i) => {
    lines.push(`- ${i + 1}. ${m.role}: ${m.content}`);
  });
  return lines.join("\n");
}

export default function ChatPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deckKey, setDeckKey] = useState("rws");
  const [spread, setSpread] = useState<SpreadKey>("five_feelings");
  const [tone, setTone] = useState<ToneKey>("direct");

  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      role: "assistant",
      content: "チャット鑑定モード。下の入力に「テーマ＋カード（数字だけOK）」をそのまま投げてください。鑑定だけ返します。",
    },
  ]);

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // ✅ 自動保存の表示だけ残す（ボタンは消す）
  const [autoSaving, setAutoSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [seedToast, setSeedToast] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

  async function getAccessToken(): Promise<string> {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw new Error(error.message);
    const token = data.session?.access_token;
    if (!token) throw new Error("Not authenticated");
    return token;
  }

  async function autoSave(finalMsgs: ChatMsg[], aiText: string) {
    setSaveOk(null);
    setAutoSaving(true);

    try {
      const token = await getAccessToken();
      const title = nowTitle();
      const cards_text = buildCardsText(deckKey, spread, tone, finalMsgs);
      const result_text = aiText;

      const res = await fetch("/api/readings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          theme: deckKey,
          title,
          cards_text,
          result_text,
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error ? String(json.error) : `API error: ${res.status}`);
      }

      setSaveOk("自動保存しました（履歴に反映）");
      window.setTimeout(() => setSaveOk(null), 2200);
    } catch (e: any) {
      setErr(`自動保存エラー: ${e?.message ?? "save error"}`);
    } finally {
      setAutoSaving(false);
    }
  }

  // ✅ /new の下書きを /chat に反映（10分以内・反映できた時だけ消す）
  useEffect(() => {
    let timer: any = null;

    try {
      const raw = localStorage.getItem("tarot_chat_seed");
      if (!raw) return;

      const seed = JSON.parse(raw) as any;

      const createdAt = typeof seed?.createdAt === "number" ? seed.createdAt : 0;
      const ageMs = Date.now() - createdAt;
      const MAX_AGE_MS = 10 * 60 * 1000;

      if (!createdAt || ageMs < 0 || ageMs > MAX_AGE_MS) {
        localStorage.removeItem("tarot_chat_seed");
        return;
      }

      let applied = false;

      if (typeof seed?.deckKey === "string" && seed.deckKey) {
        setDeckKey(seed.deckKey);
        applied = true;
      }
      if (typeof seed?.spread === "string" && seed.spread) {
        setSpread(seed.spread as SpreadKey);
        applied = true;
      }
      if (typeof seed?.tone === "string" && seed.tone) {
        setTone(seed.tone as ToneKey);
        applied = true;
      }
      if (typeof seed?.draft === "string") {
        setText(seed.draft);
        applied = true;
      }

      if (applied) {
        localStorage.removeItem("tarot_chat_seed");
        setSeedToast("下書きを反映しました");
        timer = setTimeout(() => setSeedToast(null), 2200);
      }
    } catch {
      try {
        localStorage.removeItem("tarot_chat_seed");
      } catch {}
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const spreadLabel = useMemo(() => SPREADS.find((s) => s.key === spread)?.label ?? spread, [spread]);
  const toneLabel = tone === "warm" ? "やわらかめ" : tone === "neutral" ? "ニュートラル" : "はっきりめ";

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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

      if (list.some((d) => d.key === "rws")) setDeckKey((prev) => (prev ? prev : "rws"));
      else if (list[0]?.key) setDeckKey((prev) => (prev ? prev : list[0].key));
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function send() {
    setErr(null);
    setSaveOk(null);

    const q = text.trim();
    if (!q || sending) return;

    setSending(true);

    const userMsgs: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(userMsgs);
    setText("");

    try {
      const token = await getAccessToken();

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: q,
          deckKey,
          spread,
          tone,
          promptName: "rws_master",
          messages: userMsgs.slice(-12),
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error ? String(json.error) : `API error: ${res.status}`);
      }

      const out = (json?.readingText as string | undefined) ?? (json?.text as string | undefined) ?? "";
      if (!out) throw new Error("No output");

      const finalMsgs: ChatMsg[] = [...userMsgs, { role: "assistant", content: out }];
      setMessages(finalMsgs);

      await autoSave(finalMsgs, out);
    } catch (e: any) {
      setErr(e?.message ?? "error");
      setMessages((prev) => [...prev, { role: "assistant", content: `API error: ${e?.message ?? "error"}` }]);
    } finally {
      setSending(false);
    }
  }

  function shortcutInsert(s: string) {
    setText((prev) => (prev ? `${prev}\n${s}` : s));
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.push("/login?reason=signed_out");
    }
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
      {/* ✅ login と同じ：薄い“無色ベール”のみ（青いグラデは無し） */}
      <div className="min-h-screen bg-black/10">
        <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
          {/* ヘッダー */}
          <header className="mb-8 md:mb-10">
            <div className="inline-flex flex-col gap-3">
              <h1
                className="text-4xl md:text-6xl tracking-tight text-slate-900"
                style={{
                  fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                }}
              >
                Tarot Studio
              </h1>
              <p className="text-sm md:text-base text-slate-700">カードの声を、あなたの言葉に。</p>
              <div className="text-sm text-slate-600">
                {checkingAuth ? "ログイン確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
              </div>
            </div>
          </header>

          {seedToast ? (
            <div className="mb-4 rounded-2xl border border-white/40 bg-white/40 p-3 text-sm text-slate-800 backdrop-blur-xl">
              {seedToast}
            </div>
          ) : null}

          {/* メイン枠：login/new と同じガラス */}
          <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl md:p-6">
            {/* 上部操作（枠内） */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Chat
                </span>
                <span className="text-sm text-slate-600">チャット鑑定</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/new"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-100"
                >
                  ＋ 新規鑑定
                </Link>
                <Link
                  href="/read"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  履歴
                </Link>
                <button
                  type="button"
                  onClick={() => setMessages([{ role: "assistant", content: "チャット鑑定モード。鑑定だけ返します。" }])}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  リセット
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  ログアウト
                </button>
              </div>
            </div>

            {saveOk ? (
              <div className="mt-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-slate-800">
                {saveOk}
              </div>
            ) : null}

            {autoSaving ? (
              <div className="mt-4 rounded-2xl border border-slate-200 bg-white/70 p-3 text-sm text-slate-700">
                自動保存中…
              </div>
            ) : null}

            {err ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-900">
                <div className="font-semibold">ERROR</div>
                <div className="mt-1">{err}</div>
              </div>
            ) : null}

            {/* 本体 */}
            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
              {/* 左：ショートカット＋設定（newと同じ白カード） */}
              <aside className="lg:col-span-1 space-y-4">
                <div className="rounded-2xl border border-white/50 bg-white/68 p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">ショートカット</div>
                  <div className="mt-3 space-y-2">
                    <button
                      type="button"
                      onClick={() => shortcutInsert("恋愛\nカード\n1)\n2)\n3)\n4)\n5)\n\n追加:")}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                    >
                      5枚テンプレ
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        shortcutInsert("仕事\nカード\n1)\n2)\n3)\n\n条件: 断定しない/カード名ゼロ/最後に質問しない")
                      }
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                    >
                      仕事テンプレ
                    </button>
                    <button
                      type="button"
                      onClick={() => shortcutInsert("数字だけで読む。0/1〜21/22（22は0扱い）。正逆は全部「正」扱いで続行。")}
                      className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-left text-sm font-semibold text-slate-800 shadow-sm transition hover:bg-slate-50"
                    >
                      数字だけOK ルール
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/50 bg-white/68 p-4 shadow-sm">
                  <div className="text-sm font-semibold text-slate-900">設定</div>

                  <div className="mt-3 space-y-3">
                    <div>
                      <div className="mb-2 text-xs text-slate-600">デッキ</div>
                      <select
                        value={deckKey}
                        onChange={(e) => setDeckKey(e.target.value)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
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
                      <div className="mb-2 text-xs text-slate-600">スプレッド</div>
                      <select
                        value={spread}
                        onChange={(e) => setSpread(e.target.value as SpreadKey)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
                      >
                        {SPREADS.map((s) => (
                          <option key={s.key} value={s.key}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <div className="mb-2 text-xs text-slate-600">トーン</div>
                      <select
                        value={tone}
                        onChange={(e) => setTone(e.target.value as ToneKey)}
                        className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
                      >
                        <option value="warm">やわらかめ</option>
                        <option value="neutral">ニュートラル</option>
                        <option value="direct">はっきりめ</option>
                      </select>
                    </div>

                    <div className="text-xs text-slate-600">
                      今：<span className="font-semibold text-slate-900">{deckKey}</span> /{" "}
                      <span className="font-semibold text-slate-900">{spreadLabel}</span> /{" "}
                      <span className="font-semibold text-slate-900">{toneLabel}</span>
                    </div>
                  </div>
                </div>
              </aside>

              {/* 右：チャット */}
              <section className="lg:col-span-3">
                <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm sm:p-6">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <div className="text-sm font-semibold text-slate-900">会話</div>
                    <div className="text-xs text-slate-500">Ctrl+Enter / Cmd+Enter で送信</div>
                  </div>

                  <div className="h-[56vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-4">
                    <div className="space-y-4">
                      {messages.map((m, i) => (
                        <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                          <div
                            className={clsx(
                              "max-w-[85%] rounded-2xl border px-4 py-3 text-sm shadow-sm",
                              m.role === "user"
                                ? "border-amber-200 bg-amber-50/70 text-slate-900"
                                : "border-slate-200 bg-white/90 text-slate-900"
                            )}
                          >
                            <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                          </div>
                        </div>
                      ))}
                      <div ref={bottomRef} />
                    </div>
                  </div>

                  <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                    <textarea
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      rows={4}
                      placeholder="例：恋愛。カードは 1,2,3,4,5。追加は 13。"
                      className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-900 shadow-sm outline-none placeholder:text-slate-400 focus:border-slate-300"
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />

                    <button
                      type="button"
                      onClick={send}
                      disabled={sending || !text.trim()}
                      className={clsx(
                        "rounded-2xl border px-7 py-4 text-sm font-semibold shadow-sm transition",
                        sending || !text.trim()
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100"
                      )}
                    >
                      {sending ? "送信中…" : "送信"}
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