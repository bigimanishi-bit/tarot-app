// app/read/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../src/lib/supabaseClient";
import {
  loadScope,
  isScopeReady,
  scopeLabel,
  type TarotScope,
} from "../../../src/lib/scope";

type Row = {
  id: string;
  theme: string | null;
  title: string | null;
  cards_text: string | null;
  result_text: string | null;
  created_at: string;
  client_profile_id: string | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function ReadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState("loading...");
  const [row, setRow] = useState<Row | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [scope, setScope] = useState<TarotScope | null>(null);

  const scopeText = useMemo(() => (scope ? scopeLabel(scope) : ""), [scope]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setStatus("loading...");
      setRow(null);

      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();

      if (cancelled) return;

      if (sessionErr) {
        setStatus("ERROR session: " + sessionErr.message);
        setBooting(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      const email = session.user.email ?? null;
      setUserEmail(email);

      // scope 必須
      const sc = loadScope();
      if (!isScopeReady(sc)) {
        router.replace("/welcome?reason=select_scope");
        return;
      }
      setScope(sc);

      // 招待制
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

      if (cancelled) return;

      if (allowErr || !allowedRows?.[0]) {
        await supabase.auth.signOut();
        router.replace("/login?reason=invite_only");
        return;
      }

      if (!id) {
        setStatus("ERROR: id is missing");
        setBooting(false);
        return;
      }

      let q = supabase
        .from("readings")
        .select(
          "id, theme, title, cards_text, result_text, created_at, client_profile_id"
        )
        .eq("id", id)
        .eq("user_id", session.user.id)
        .limit(1);

      if (sc.targetType === "self") {
        q = q.is("client_profile_id", null);
      } else {
        q = q.eq("client_profile_id", sc.clientProfileId);
      }

      const { data, error } = await q;

      if (cancelled) return;

      if (error) {
        setStatus("ERROR readings: " + error.message);
        setBooting(false);
        return;
      }

      const r = (data ?? [])[0] as Row | undefined;
      if (!r) {
        setStatus("not found (or no permission)");
        setBooting(false);
        return;
      }

      setRow(r);
      setStatus("ok");
      setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router, id]);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

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
              {scopeText || "scope未選択"}
            </span>

            <Link
              href="/read"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              History
            </Link>

            <Link
              href="/new"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              New
            </Link>

            <Link
              href="/chat"
              className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
            >
              Chat
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
            鑑定詳細
          </h1>
          <p className="mt-2 text-sm text-white/65">
            {userEmail ? `ログイン中：${userEmail}` : ""}
            {status && status !== "ok" ? ` / ${status}` : ""}
          </p>
        </header>

        <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-5">
          {row ? (
            <div className="rounded-2xl border border-white/10 bg-white/7 p-5 md:p-6">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/75">
                  {row.theme ?? "rws"}
                </span>
                <span className="text-xs text-white/45">
                  {formatDate(row.created_at)}
                </span>
                <span className="ml-auto text-xs text-white/45">
                  {scopeText}
                </span>
              </div>

              <h2 className="mt-4 text-2xl font-semibold text-white">
                {row.title || "タイトルなし"}
              </h2>

              {row.result_text ? (
                <div className="mt-4 whitespace-pre-wrap text-sm leading-7 text-white/85">
                  {row.result_text}
                </div>
              ) : (
                <div className="mt-4 text-sm text-white/65">
                  鑑定結果がありません
                </div>
              )}

              {row.cards_text ? (
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="mb-2 text-[11px] font-semibold tracking-widest text-white/55">
                    PAYLOAD
                  </div>
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/80">
                    {row.cards_text}
                  </pre>
                </div>
              ) : null}

              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/read"
                  className="rounded-xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/12"
                >
                  履歴へ戻る
                </Link>
                <Link
                  href="/new"
                  className="rounded-xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/12"
                >
                  ＋ 新規鑑定
                </Link>
                <Link
                  href="/chat"
                  className="rounded-xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/12"
                >
                  チャットへ
                </Link>
                <Link
                  href="/welcome"
                  className="rounded-xl border border-white/12 bg-white/8 px-4 py-2 text-sm font-semibold text-white/85 hover:bg-white/12"
                >
                  Welcome（切替）
                </Link>
              </div>
            </div>
          ) : (
            <div className="rounded-2xl border border-white/10 bg-white/7 p-5 text-sm text-white/70">
              {status.startsWith("ERROR")
                ? "読み込みに失敗しました。"
                : "読み込み中… / もしくは権限がありません。"}
            </div>
          )}
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