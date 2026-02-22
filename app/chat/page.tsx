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

function pickLastAssistant(msgs: ChatMsg[]) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].role === "assistant") return msgs[i].content;
  }
  return "";
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

  const [saving, setSaving] = useState(false);
  const [saveOk, setSaveOk] = useState<string | null>(null);

  const [seedToast, setSeedToast] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement | null>(null);

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

      // 古いseedは誤爆防止で捨てる
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
      // 壊れてても消して終了
      try {
        localStorage.removeItem("tarot_chat_seed");
      } catch {}
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, []);

  const spreadLabel = useMemo(() => {
    return SPREADS.find((s) => s.key === spread)?.label ?? spread;
  }, [spread]);

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

      // seedでセットされてるかもしれないので、空の時だけ補完
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

    const nextMsgs: ChatMsg[] = [...messages, { role: "user", content: q }];
    setMessages(nextMsgs);
    setText("");

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: q,
          deckKey,
          spread,
          tone,
          promptName: "rws_master",
          messages: nextMsgs.slice(-12),
        }),
      });

      const json = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        throw new Error(json?.error ? String(json.error) : `API error: ${res.status}`);
      }

      const out = (json?.readingText as string | undefined) ?? (json?.text as string | undefined) ?? "";
      if (!out) throw new Error("No output");

      setMessages((prev) => [...prev, { role: "assistant", content: out }]);
    } catch (e: any) {
      setErr(e?.message ?? "error");
      setMessages((prev) => [...prev, { role: "assistant", content: `API error: ${e?.message ?? "error"}` }]);
    } finally {
      setSending(false);
    }
  }

  async function saveReading() {
    setErr(null);
    setSaveOk(null);
    if (saving) return;

    const lastAi = pickLastAssistant(messages);
    if (!lastAi) {
      setErr("まだ鑑定結果がありません。まず送信して鑑定を出してください。");
      return;
    }

    setSaving(true);
    try {
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      const user = userData?.user;
      if (userErr || !user) {
        throw new Error("Not authenticated");
      }

      const title = nowTitle();
      const cards_text = buildCardsText(deckKey, spread, tone, messages);
      const result_text = lastAi;

      const res = await fetch("/api/readings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          user_id: user.id,
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

      setSaveOk("保存しました。/read に反映します。");
    } catch (e: any) {
      setErr(e?.message ?? "save error");
    } finally {
      setSaving(false);
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
    <main className="min-h-screen text-white">
      <style>{`
        :root{
          --gold: 226, 180, 92;
          --amber: 255, 196, 120;
          --vio: 160, 110, 255;
          --cya:  90, 220, 255;
          --bd: rgba(255,255,255,.12);
          --glassTop: rgba(255,255,255,.12);
          --glassBot: rgba(255,255,255,.06);
        }

        .bg{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          background: url("/assets/occult-bg.jpg");
          background-size: cover;
          background-position: center;
          filter: saturate(1.05) contrast(1.06) brightness(.80);
          opacity: .95;
          transform: scale(1.01);
        }
        .veil{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          background:
            radial-gradient(1200px 700px at 50% 25%, rgba(255,255,255,.06), transparent 60%),
            radial-gradient(1000px 650px at 15% 20%, rgba(var(--vio), .10), transparent 62%),
            radial-gradient(900px 600px at 85% 25%, rgba(var(--amber), .10), transparent 65%),
            linear-gradient(180deg, rgba(0,0,0,.60), rgba(0,0,0,.72));
          opacity: .92;
        }
        .dust{
          position: fixed; inset:0; z-index:0; pointer-events:none;
          opacity:.18;
          background-image: radial-gradient(rgba(255,255,255,.35) 1px, transparent 1px);
          background-size: 160px 160px;
          background-position: 10px 40px;
          mask-image: radial-gradient(900px 600px at 40% 18%, #000 30%, transparent 75%);
        }

        .glass{
          background: linear-gradient(180deg, var(--glassTop), var(--glassBot));
          border: 1px solid var(--bd);
          box-shadow:
            0 18px 70px rgba(0,0,0,.55),
            inset 0 1px 0 rgba(255,255,255,.08);
          backdrop-filter: blur(18px);
        }
        .goldEdge{
          position: relative;
          border-radius: 28px;
        }
        .goldEdge:before{
          content:"";
          position:absolute;
          inset:-1px;
          border-radius: 30px;
          background: linear-gradient(135deg,
            rgba(var(--gold), .35),
            rgba(var(--vio), .18),
            rgba(var(--cya), .14),
            rgba(var(--gold), .22)
          );
          z-index:-1;
          filter: blur(.25px);
          opacity:.85;
        }

        .btn{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.07);
          box-shadow: inset 0 1px 0 rgba(255,255,255,.06);
          transition: transform .12s ease, border-color .12s ease, background .12s ease;
        }
        .btn:hover{ transform: translateY(-1px); border-color: rgba(255,255,255,.26); background: rgba(255,255,255,.09); }
        .btn:active{ transform: translateY(0px) scale(.99); }

        .btnGold{
          border: 1px solid rgba(var(--gold), .55);
          background:
            radial-gradient(100% 120% at 20% 10%, rgba(255,255,255,.20), transparent 55%),
            linear-gradient(180deg, rgba(var(--gold), .28), rgba(var(--gold), .12));
          color: rgba(255,245,230,.98);
          box-shadow:
            0 14px 40px rgba(0,0,0,.45),
            inset 0 1px 0 rgba(255,255,255,.14);
        }

        .field{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.28);
          outline: none;
        }

        .chatPane{
          background: rgba(0,0,0,.20);
          border: 1px solid rgba(255,255,255,.12);
        }

        .bubbleBase{
          border-radius: 18px;
          border: 1px solid rgba(255,255,255,.14);
          box-shadow:
            0 18px 50px rgba(0,0,0,.45),
            inset 0 1px 0 rgba(255,255,255,.08);
          backdrop-filter: blur(10px);
        }
        .bubbleAi{
          background:
            radial-gradient(120% 160% at 10% 10%, rgba(var(--vio), .10), transparent 55%),
            linear-gradient(180deg, rgba(0,0,0,.50), rgba(0,0,0,.34));
          color: rgba(255,255,255,.92);
        }
        .bubbleUser{
          background:
            radial-gradient(120% 160% at 10% 10%, rgba(var(--gold), .12), transparent 60%),
            linear-gradient(180deg, rgba(255,255,255,.92), rgba(255,255,255,.86));
          color: rgba(0,0,0,.92);
          border-color: rgba(var(--gold), .22);
        }

        .aiAccent{
          position: relative;
          padding-left: 14px;
        }
        .aiAccent:before{
          content:"";
          position:absolute;
          left: 0;
          top: 10px;
          bottom: 10px;
          width: 3px;
          border-radius: 999px;
          background: linear-gradient(180deg, rgba(var(--gold), .55), rgba(var(--vio), .35));
          opacity: .85;
        }

        .pill{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(255,255,255,.08);
        }

        .heroTitle{
          text-shadow: 0 10px 30px rgba(0,0,0,.55);
          letter-spacing: .02em;
        }
      `}</style>

      <div className="bg" />
      <div className="veil" />
      <div className="dust" />

      <div className="relative z-10 mx-auto w-full max-w-6xl px-4 py-8">
        {seedToast ? (
          <div className="mb-4 goldEdge glass rounded-[18px] p-3 text-sm text-amber-50">
            {seedToast}
          </div>
        ) : null}

        <div className="mb-5 flex items-center justify-end gap-2">
          <Link href="/new" className="pill rounded-full px-4 py-2 text-xs text-white/80 hover:text-white">
            ＋ 新規鑑定
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
                <span className="text-[12px] text-white/45">Chat</span>
              </div>

              <h1 className="heroTitle mt-4 text-2xl sm:text-3xl font-semibold">チャット鑑定</h1>
              <div className="mt-3 text-sm text-white/70">
                {checkingAuth ? "ログイン確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <Link href="/new" className="btn btnGold rounded-2xl px-5 py-3 text-sm font-semibold">
                ＋ 新規鑑定
              </Link>
              <Link href="/read" className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
                履歴
              </Link>

              <button
                type="button"
                onClick={saveReading}
                disabled={saving}
                className={clsx("btn btnGold rounded-2xl px-5 py-3 text-sm font-semibold", saving ? "opacity-60 cursor-not-allowed" : "")}
              >
                {saving ? "保存中…" : "保存"}
              </button>

              <button
                type="button"
                onClick={() => setMessages([{ role: "assistant", content: "チャット鑑定モード。鑑定だけ返します。" }])}
                className="btn rounded-2xl px-5 py-3 text-sm text-white/90"
              >
                リセット
              </button>
            </div>
          </div>

          {saveOk ? (
            <div className="mt-4 goldEdge glass rounded-[18px] p-3 text-sm text-amber-50">
              {saveOk}
            </div>
          ) : null}

          <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-4">
            <aside className="lg:col-span-1 space-y-4">
              <div className="goldEdge glass rounded-[24px] p-4">
                <div className="text-sm font-semibold text-white/90">ショートカット</div>

                <div className="mt-3 space-y-2">
                  <button
                    type="button"
                    onClick={() => shortcutInsert("恋愛\nカード\n1)\n2)\n3)\n4)\n5)\n\n追加:")}
                    className="btn w-full rounded-2xl px-3 py-3 text-left text-xs text-white/85"
                  >
                    5枚テンプレ
                  </button>

                  <button
                    type="button"
                    onClick={() => shortcutInsert("仕事\nカード\n1)\n2)\n3)\n\n条件: 断定しない/カード名ゼロ/最後に質問しない")}
                    className="btn w-full rounded-2xl px-3 py-3 text-left text-xs text-white/85"
                  >
                    仕事テンプレ
                  </button>

                  <button
                    type="button"
                    onClick={() => shortcutInsert("数字だけで読む。0/1〜21/22（22は0扱い）。正逆は全部「正」扱いで続行。")}
                    className="btn w-full rounded-2xl px-3 py-3 text-left text-xs text-white/85"
                  >
                    数字だけOK ルール
                  </button>
                </div>
              </div>

              <div className="goldEdge glass rounded-[24px] p-4">
                <div className="text-sm font-semibold text-white/90">設定</div>

                <div className="mt-3 space-y-3">
                  <div>
                    <div className="mb-2 text-xs text-white/60">デッキ</div>
                    <select
                      value={deckKey}
                      onChange={(e) => setDeckKey(e.target.value)}
                      className="field w-full rounded-2xl px-4 py-3 text-sm text-white"
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
                    <div className="mb-2 text-xs text-white/60">スプレッド</div>
                    <select
                      value={spread}
                      onChange={(e) => setSpread(e.target.value as SpreadKey)}
                      className="field w-full rounded-2xl px-4 py-3 text-sm text-white"
                    >
                      {SPREADS.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <div className="mb-2 text-xs text-white/60">トーン</div>
                    <select
                      value={tone}
                      onChange={(e) => setTone(e.target.value as ToneKey)}
                      className="field w-full rounded-2xl px-4 py-3 text-sm text-white"
                    >
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
              {checkingAuth ? (
                <div className="text-sm text-white/70">ログイン確認中…</div>
              ) : (
                <>
                  {err ? (
                    <div className="mb-4 goldEdge glass rounded-[18px] p-3 text-sm text-red-100">
                      <div className="text-red-200/90">ERROR</div>
                      <div className="mt-1 text-red-100/90">{err}</div>
                    </div>
                  ) : null}

                  <div className="goldEdge glass rounded-[26px] p-4">
                    <div className="chatPane h-[56vh] overflow-y-auto rounded-2xl p-4">
                      <div className="space-y-4">
                        {messages.map((m, i) => (
                          <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                            <div className={clsx("bubbleBase max-w-[85%] px-4 py-3 text-sm", m.role === "user" ? "bubbleUser" : "bubbleAi aiAccent")}>
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
                        className="field w-full resize-none rounded-2xl px-4 py-4 text-sm leading-7 text-white placeholder:text-white/35"
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
                        className={clsx("btn btnGold rounded-2xl px-7 py-4 text-sm font-semibold", "disabled:opacity-50 disabled:cursor-not-allowed")}
                      >
                        {sending ? "送信中…" : "送信"}
                      </button>
                    </div>

                    <div className="mt-2 text-xs text-white/50">Ctrl+Enter / Cmd+Enter で送信</div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}