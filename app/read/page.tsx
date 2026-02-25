// app/read/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";
import {
  loadScope,
  isScopeReady,
  scopeLabel,
  type TarotScope,
} from "../../src/lib/scope";

type ReadingRow = {
  id: string;
  title: string | null;
  theme: string | null;
  cards_text: string | null;
  result_text: string | null;
  created_at: string | null;
  mode: string | null;
  target_type: string | null;
  client_profile_id: string | null;
};

type DeckRow = { key: string; name: string | null };

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function formatDt(v: string | null) {
  if (!v) return "";
  const d = new Date(v);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`;
}

export default function ReadPage() {
  const router = useRouter();

  // ✅ Hooksは必ず最上段で全部呼ぶ（条件で増減させない）
  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState("loading...");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [rows, setRows] = useState<ReadingRow[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  // ---- auth + scope ----
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

      // scope 必須：なければ welcome に戻す（プライバシー）
      const sc = loadScope();
      if (!isScopeReady(sc)) {
        router.replace("/welcome?reason=select_scope");
        return;
      }

      setScope(sc);
      setBooting(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // ---- decks ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data: deckRows } = await supabase
        .from("deck_library")
        .select("key, name")
        .order("name", { ascending: true });

      if (cancelled) return;
      setDecks((deckRows ?? []) as DeckRow[]);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- readings (scope + filters) ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (booting) return;
      if (!scope) return;

      setStatus("loading...");

      // scopeで完全分離（混ざらない）
      let query = supabase
        .from("readings")
        .select(
          "id,title,theme,cards_text,result_text,created_at,mode,target_type,client_profile_id"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (scope.kind === "self") {
        query = query.eq("target_type", "self");
      } else {
        query = query.eq("target_type", "client");
        query = query.eq("client_profile_id", scope.clientProfileId);
      }

      // deck filter は mode に deckKey を入れてる前提（あなたの実装に合わせて）
      // ※もし deckKey を別カラムで持ってるなら、ここを差し替えてOK
      if (deckFilter !== "all") {
        query = query.ilike("mode", `%${deckFilter}%`);
      }

      const { data, error } = await query;

      if (cancelled) return;

      if (error) {
        setStatus(error.message);
        setRows([]);
        return;
      }

      setRows((data ?? []) as ReadingRow[]);
      setStatus("ok");
    })();

    return () => {
      cancelled = true;
    };
  }, [booting, scope, deckFilter]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((r) => {
      const hay =
        `${r.title ?? ""}\n${r.theme ?? ""}\n${r.cards_text ?? ""}\n${
          r.result_text ?? ""
        }\n${r.mode ?? ""}`.toLowerCase();
      return hay.includes(keyword);
    });
  }, [rows, q]);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  // ✅ 早期 return は Hooks の後ならOK（booting中は表示だけ変える）
  return (
    <main className="min-h-screen bg-[#0B1020] text-white">
      {/* 背景：loginに寄せた夜空 */}
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

      {/* sticky header */}
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
              ＋ 新規鑑定
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
            History
          </h1>
          <p className="mt-2 text-sm text-white/65">
            保存された鑑定を一覧できます（scopeで完全分離）
          </p>
          <p className="mt-1 text-xs text-white/45">
            {userEmail ? `ログイン中：${userEmail}` : ""}{" "}
            {status !== "ok" ? ` / ${status}` : ""}
          </p>
        </header>

        {/* controls */}
        <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-5">
          <div className="grid gap-3 md:grid-cols-3 md:items-end">
            <div>
              <div className="mb-2 text-xs font-semibold text-white/75">
                検索
              </div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="タイトル / テーマ / 結果 / デッキ など"
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
              />
            </div>

            <div>
              <div className="mb-2 text-xs font-semibold text-white/75">
                デッキ
              </div>
              <select
                value={deckFilter}
                onChange={(e) => setDeckFilter(e.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none focus:border-white/20"
              >
                <option value="all">全デッキ</option>
                {decks.map((d) => (
                  <option key={d.key} value={d.key}>
                    {d.name ?? d.key}
                  </option>
                ))}
              </select>
              <div className="mt-2 text-[11px] text-white/45">
                ※ deckFilter は mode に deckKey が入ってる想定
              </div>
            </div>

            <div className="flex items-center justify-between gap-2">
              <Link
                href="/welcome"
                className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/85 hover:bg-white/12"
              >
                scopeを切り替える（Welcome）
              </Link>
            </div>
          </div>

          <div className="mt-5 border-t border-white/10 pt-5">
            {booting ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                読み込み中…
              </div>
            ) : filtered.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                まだ履歴がありません（このscopeでは0件）
              </div>
            ) : (
              <div className="space-y-3">
                {filtered.map((r) => (
                  <article
                    key={r.id}
                    className="rounded-2xl border border-white/10 bg-white/5 p-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="text-xs text-white/55">
                        {formatDt(r.created_at)}{" "}
                        {r.mode ? ` / ${r.mode}` : ""}
                      </div>
                      <div className="flex items-center gap-2">
                        <Link
                          href={`/read/${r.id}`}
                          className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                        >
                          開く
                        </Link>
                      </div>
                    </div>

                    <div
                      className="mt-2 text-lg font-semibold text-white"
                      style={{
                        fontFamily:
                          'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                      }}
                    >
                      {r.title ?? "（無題）"}
                    </div>

                    {r.result_text ? (
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-white/70">
                        {r.result_text}
                      </p>
                    ) : (
                      <p className="mt-2 text-sm text-white/45">
                        （結果テキストなし）
                      </p>
                    )}
                  </article>
                ))}
              </div>
            )}
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