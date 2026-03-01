// app/read/[id]/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "../../../src/lib/supabaseClient";
import { loadScope, isScopeReady, scopeLabel, type TarotScope } from "../../../src/lib/scope";

type Row = {
  id: string;
  theme: string | null;
  title: string | null;
  cards_text: string | null;
  result_text: string | null;
  created_at: string;
  client_profile_id: string | null;
};

type PayloadMeta = {
  scopeLabel?: string | null;
  deckKey?: string | null;
  wantDictionary?: boolean | null;
  question?: string | null;
  messagesCount?: number | null;
  hasInitialReadingText?: boolean | null;

  userBirthDate?: string | null;
  clientBirthDate?: string | null;
  weather?: any;
  moon?: any;
  historyCount?: number | null;
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

function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function fmtTemp(v: any) {
  return typeof v === "number" ? `${Math.round(v)}℃` : "—";
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

  const payload = useMemo(() => {
    const raw = row?.cards_text ?? null;
    const parsed = safeJsonParse<PayloadMeta>(raw);
    return { raw, parsed };
  }, [row?.cards_text]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setStatus("loading...");
      setRow(null);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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
        .select("id, theme, title, cards_text, result_text, created_at, client_profile_id")
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

  const meta = payload.parsed;

  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/6 text-white/60"
    );

  return (
    <main className="min-h-screen">
      <div className="relative min-h-screen overflow-hidden bg-[#0B1020] text-white">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 18% 22%, rgba(120,140,255,0.18), transparent 60%)," +
              "radial-gradient(900px 520px at 82% 30%, rgba(255,255,255,0.06), transparent 62%)," +
              "linear-gradient(180deg, rgba(5,8,18,0.86) 0%, rgba(10,15,30,0.92) 35%, rgba(3,5,12,0.96) 100%)",
          }}
        />
        <Stars />

        {/* ✅ Header（Welcomeと同型） */}
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/55 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <Link
                href="/welcome"
                className="inline-flex items-center gap-3 rounded-2xl px-2 py-1 transition hover:bg-white/5"
                aria-label="Tarot Studio（Welcomeへ）"
              >
                <span className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/10 text-xs font-semibold text-white/80">
                  TS
                </span>
                <span className="text-base font-semibold tracking-tight text-white md:text-lg">
                  Tarot Studio
                </span>
                <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 sm:inline-flex">
                  招待制 / Invite only
                </span>
              </Link>

              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-white/55 md:inline">
                  {userEmail ? `ログイン中：${userEmail}` : ""}
                </span>
                <button
                  onClick={logout}
                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* ✅ Footerぶん余白 */}
        <div className="relative mx-auto max-w-6xl px-4 py-7 pb-28 md:px-6 md:py-10 md:pb-32">
          <header className="mb-4 rounded-2xl border border-white/10 bg-white/7 px-5 py-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-white/55">READ</div>
            <div
              className="mt-2 text-xl font-semibold text-white"
              style={{ fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif' }}
            >
              鑑定詳細
            </div>
            <div className="mt-1 text-sm text-white/55">scope：{scopeText || "—"}</div>
            <div className="mt-1 text-xs text-white/45">{status && status !== "ok" ? status : ""}</div>
          </header>

          <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-5">
            {row ? (
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 md:p-6">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold text-white/75">
                    {row.theme ?? "rws"}
                  </span>
                  <span className="text-xs text-white/45">{formatDate(row.created_at)}</span>
                  <span className="ml-auto text-xs text-white/45">{scopeText}</span>
                </div>

                <h2 className="mt-4 text-2xl font-semibold text-white">{row.title || "タイトルなし"}</h2>

                {/* 材料カード（JSON payload がある時だけ見やすく） */}
                {meta ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-3 text-[11px] font-semibold tracking-widest text-white/55">材料</div>

                    <div className="grid gap-3 md:grid-cols-2">
                      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                        <div className="text-xs font-semibold text-white/80">生年月日</div>
                        <div className="mt-2 text-sm text-white/85">
                          あなた：{meta.userBirthDate ?? "—"}
                          <br />
                          相談者：{meta.clientBirthDate ?? "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/6 p-4">
                        <div className="text-xs font-semibold text-white/80">月</div>
                        <div className="mt-2 text-sm text-white/85">
                          {meta.moon?.phaseLabel ?? "—"} / 月齢{" "}
                          {typeof meta.moon?.ageDays === "number" ? meta.moon.ageDays.toFixed(1) : "—"}日 /{" "}
                          {typeof meta.moon?.pct === "number" ? `${meta.moon.pct}%` : "—"}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/6 p-4 md:col-span-2">
                        <div className="text-xs font-semibold text-white/80">天気</div>
                        <div className="mt-2 text-sm text-white/85">
                          {meta.weather?.locationLabel ?? "—"} / {meta.weather?.weatherLabel ?? "—"} / いま
                          {fmtTemp(meta.weather?.currentTempC)} 最高{fmtTemp(meta.weather?.todayMaxC)} 最低
                          {fmtTemp(meta.weather?.todayMinC)}
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-white/6 p-4 md:col-span-2">
                        <div className="text-xs font-semibold text-white/80">履歴</div>
                        <div className="mt-2 text-sm text-white/85">
                          参照件数：{typeof meta.historyCount === "number" ? meta.historyCount : "—"}
                          <br />
                          参考：scope {meta.scopeLabel ?? "—"} / deck {meta.deckKey ?? "—"}
                        </div>
                      </div>

                      {meta.question ? (
                        <div className="rounded-2xl border border-white/10 bg-white/6 p-4 md:col-span-2">
                          <div className="text-xs font-semibold text-white/80">質問（Chat由来）</div>
                          <div className="mt-2 whitespace-pre-wrap text-sm text-white/85">{meta.question}</div>
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-3 text-[11px] text-white/45">
                      ※「今日の3枚（WelcomeのTODAY）」は材料に混ぜません。
                    </div>
                  </div>
                ) : null}

                {row.result_text ? (
                  <div className="mt-5 whitespace-pre-wrap text-sm leading-7 text-white/85">{row.result_text}</div>
                ) : (
                  <div className="mt-4 text-sm text-white/65">鑑定結果がありません</div>
                )}

                {payload.raw ? (
                  <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="mb-2 text-[11px] font-semibold tracking-widest text-white/55">PAYLOAD（raw）</div>
                    <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/80">
                      {payload.raw}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 text-sm text-white/70">
                {status.startsWith("ERROR") ? "読み込みに失敗しました。" : "読み込み中… / もしくは権限がありません。"}
              </div>
            )}
          </section>
        </div>

        {/* ✅ Footer（Welcomeと同型：下固定CTA） */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span className={chip(true)}>{scopeText || "scope"}</span>
                <span className={chip(!!row)}>{row ? "表示中" : "—"}</span>
              </div>

              <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                <Link
                  href="/read"
                  className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/85 hover:bg-white/12"
                >
                  相談履歴
                </Link>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/chat"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    つづき相談
                  </Link>

                  <Link
                    href="/new"
                    className="rounded-2xl border border-white/18 bg-white/14 px-3 py-3 text-center text-xs font-semibold text-white hover:bg-white/18"
                  >
                    新規鑑定
                  </Link>
                </div>
              </div>
            </div>

            <div className="mt-2 grid grid-cols-2 gap-2">
              <Link
                href="/welcome"
                className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
              >
                ホーム
              </Link>

              <button
                type="button"
                onClick={() => router.back()}
                className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
              >
                戻る
              </button>
            </div>
          </div>
        </div>

      </div>
    </main>
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