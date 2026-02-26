// app/chat/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";
import {
  loadScope,
  isScopeReady,
  scopeLabel,
  type TarotScope,
} from "../../src/lib/scope";

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: number;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function storageKey(scope: TarotScope) {
  // scopeで完全分離（混ざらない）
  if (scope.targetType === "self") return "ts_chat_self";
  return `ts_chat_client_${scope.clientProfileId}`;
}

export default function ChatPage() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // ✅ Hooks は必ず最上段で全部呼ぶ（条件で増減させない）
  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState<string>("loading...");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

    // newから渡す seed（あれば最初に流す）
  const seed = useMemo(() => {
    return safeJsonParse<{
      deckKey?: string;
      spread?: string;
      tone?: string;
      draft?: string;
      createdAt?: number;

      // ✅ Newの一時鑑定結果（Chat先頭に差し込む）
      initialReadingText?: string | null;

      // 将来増えても落ちないように（必要なら使う）
      scope?: any;
    }>(typeof window !== "undefined" ? localStorage.getItem("tarot_chat_seed") : null);
  }, []);

  // auth + scope 必須
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setStatus("loading...");

      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionErr) {
        setStatus(sessionErr.message);
        setBooting(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      setUserEmail(session.user.email ?? null);

      const sc = loadScope();
      if (!isScopeReady(sc)) {
        router.replace("/welcome?reason=select_scope");
        return;
      }

      setScope(sc);
      setBooting(false);
      setStatus("ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

 // scope が決まったら、そのscope専用のチャットログを読み込む
useEffect(() => {
  if (booting) return;
  if (!scope) return;

  const key = storageKey(scope);
  const saved = safeJsonParse<ChatMsg[]>(localStorage.getItem(key));
  if (saved?.length) {
    setMessages(saved);
    return;
  }

  // 初回だけ seed があれば差し込む（new→chatの相談用）
  if (seed?.draft?.trim()) {
    const initial: ChatMsg[] = [
      {
        id: makeId(),
        role: "system",
        text:
          "Welcomeで選んだscopeの相談ルームです（混ざりません）。\n必要なら下の内容から相談を続けてください。",
        createdAt: Date.now(),
      },

      // ✅ Newの一時鑑定があるなら、先頭に入れる（以後これを前提に質問できる）
      ...(seed?.initialReadingText?.trim()
        ? [
            {
              id: makeId(),
              role: "assistant",
              text:
                "【一時鑑定（Newの結果）】\n" +
                seed.initialReadingText.trim() +
                "\n\n（この内容を前提に、ここから質問してOK）",
              createdAt: Date.now(),
            } as ChatMsg,
          ]
        : []),

      {
        id: makeId(),
        role: "user",
        text: seed.draft.trim(),
        createdAt: Date.now(),
      },
    ];

    setMessages(initial);

    // seed は一度使ったら消す（混線防止）
    try {
      localStorage.removeItem("tarot_chat_seed");
    } catch {}

    return;
  }

  // 何もない場合は軽い案内だけ
  setMessages([
    {
      id: makeId(),
      role: "system",
      text:
        "ここは相談用Chatです。\nNewで鑑定 → 追加の疑問が出たらここで相談、の流れでOK。",
      createdAt: Date.now(),
    },
  ]);
}, [booting, scope, seed]); // eslint-disable-line react-hooks/exhaustive-deps
// eslint-disable-line react-hooks/exhaustive-deps

  // messages 保存（scopeごと）
  useEffect(() => {
    if (!scope) return;
    const key = storageKey(scope);
    try {
      localStorage.setItem(key, JSON.stringify(messages));
    } catch {}
  }, [messages, scope]);

  // 末尾スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  async function send() {
    if (sending) return;
    const text = input.trim();
    if (!text) return;
    if (!scope) return;

    const userMsg: ChatMsg = {
      id: makeId(),
      role: "user",
      text,
      createdAt: Date.now(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStatus("sending...");

    // ✅ ここは「APIがあれば返す / なければ落ちない」実装
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: text,
          scope,
        }),
      });

      if (!res.ok) {
        throw new Error(`api error: ${res.status}`);
      }

      const data = (await res.json()) as { reply?: string };
      const reply = (data.reply ?? "").trim();

      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text: reply || "（返答が空でした）",
          createdAt: Date.now(),
        },
      ]);
      setStatus("ok");
    } catch (e: any) {
      // API が未実装/落ちても UI は壊さない
      setMessages((prev) => [
        ...prev,
        {
          id: makeId(),
          role: "assistant",
          text:
            "（ここは相談UIだけ先に整えてます）\n/api/chat がまだ無い or エラーなので、まずAPI側をつなげよう。",
          createdAt: Date.now(),
        },
      ]);
      setStatus(e?.message ?? "error");
    } finally {
      setSending(false);
    }
  }

  // ✅ 早期returnは Hooks の後ならOK
  if (booting) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-white/12 bg-white/6 p-5 backdrop-blur-2xl">
            読み込み中…
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#0B1020] text-white">
      {/* 背景（loginと統一） */}
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
        <Stars />
      </div>

      {/* sticky header（TarotStudio押したらWelcomeへ） */}
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
              {scope ? scopeLabel(scope) : "scope未選択"}
            </span>

            <Link
              href="/new"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              New
            </Link>

            <Link
              href="/read"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              History
            </Link>

            <button
              onClick={logout}
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              ログアウト
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto max-w-6xl px-4 py-6 md:px-6 md:py-10">
        <header className="mb-4">
          <h1
            className="text-2xl font-semibold tracking-tight text-white md:text-3xl"
            style={{
              fontFamily:
                'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
            }}
          >
            Chat
          </h1>
          <p className="mt-2 text-sm text-white/65">
            追加の疑問・深掘り相談をここで。scopeはWelcomeでだけ切り替え（混線防止）。
          </p>
          <p className="mt-1 text-xs text-white/45">
            {userEmail ? `ログイン中：${userEmail}` : ""}{" "}
            {status && status !== "ok" ? ` / ${status}` : ""}
          </p>
        </header>

        <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-5">
          <div className="h-[55vh] overflow-auto rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="space-y-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={clsx(
                    "max-w-[85%] whitespace-pre-wrap rounded-2xl border p-3 text-sm leading-7",
                    m.role === "user"
                      ? "ml-auto border-white/12 bg-white/10 text-white"
                      : m.role === "assistant"
                      ? "mr-auto border-white/10 bg-white/6 text-white/85"
                      : "mx-auto border-white/8 bg-white/4 text-white/65"
                  )}
                >
                  {m.text}
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          </div>

          <div className="mt-4 grid gap-2 md:grid-cols-[1fr_auto] md:items-end">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="ここに相談を書く（Enterで改行）"
              rows={3}
              className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
              disabled={sending}
            />

            <button
              onClick={send}
              disabled={sending || !input.trim()}
              className={clsx(
                "rounded-2xl border px-5 py-3 text-sm font-semibold shadow-sm transition",
                sending || !input.trim()
                  ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                  : "border-white/15 bg-white/10 text-white hover:bg-white/14"
              )}
            >
              {sending ? "送信中…" : "送信"}
            </button>
          </div>

          <div className="mt-3 flex items-center justify-between text-xs text-white/45">
            <span>Tarot Studio / private beta</span>
            <Link href="/welcome" className="hover:text-white/70">
              scopeを切り替える（Welcome）
            </Link>
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