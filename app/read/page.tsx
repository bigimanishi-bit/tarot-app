// app/read/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";
import { loadScope, scopeLabel, type TarotScope } from "../../src/lib/scope";

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

type ClientProfileRow = {
  id: string;
  display_name: string;
  relationship_type: string | null;
  memo: string | null;
  is_active: boolean;
  updated_at: string;
};

type ViewTarget = "all" | "self" | "client";

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

  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState("loading...");
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // scopeは「参考表示」用（必須にしない）
  const [scope, setScope] = useState<TarotScope | null>(null);

  const [rows, setRows] = useState<ReadingRow[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [q, setQ] = useState("");

  // 閲覧モード（全て / 自分 / カルテ）
  const [viewTarget, setViewTarget] = useState<ViewTarget>("all");

  // カルテ一覧 + 選択
  const [profiles, setProfiles] = useState<ClientProfileRow[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<string>("");

  // ---- auth + scope ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setStatus("loading...");

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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

      // scopeは「あるなら読む」だけ（必須にしない）
      const sc = loadScope();
      setScope(sc);

      setBooting(false);
      setStatus("ok");
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

  // ---- client profiles (for filter) ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("client_profiles")
        .select("id, display_name, relationship_type, memo, is_active, updated_at")
        .order("updated_at", { ascending: false });

      if (cancelled) return;

      if (error) {
        setProfiles([]);
        return;
      }

      const list = (data ?? []) as ClientProfileRow[];
      setProfiles(list);

      setSelectedClientId((prev) => {
        if (prev) return prev;
        const firstActive = list.find((p) => p.is_active);
        return firstActive?.id ?? "";
      });
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // ---- readings (filters) ----
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (booting) return;

      setStatus("loading...");

      let query = supabase
        .from("readings")
        .select("id,title,theme,cards_text,result_text,created_at,mode,target_type,client_profile_id")
        .order("created_at", { ascending: false })
        .limit(200);

      if (viewTarget === "self") {
        query = query.eq("target_type", "self");
      } else if (viewTarget === "client") {
        query = query.eq("target_type", "client");
        if (selectedClientId) {
          query = query.eq("client_profile_id", selectedClientId);
        } else {
          setRows([]);
          setStatus("ok");
          return;
        }
      }

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
  }, [booting, viewTarget, selectedClientId, deckFilter]);

  const filtered = useMemo(() => {
    const keyword = q.trim().toLowerCase();
    if (!keyword) return rows;

    return rows.filter((r) => {
      const hay =
        `${r.title ?? ""}\n${r.theme ?? ""}\n${r.cards_text ?? ""}\n${r.result_text ?? ""}\n${r.mode ?? ""}`.toLowerCase();
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

  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/6 text-white/60"
    );

  return (
    <main className="min-h-screen">
      {/* ✅ option白問題：このページだけで潰す（layout触らない） */}
      <style jsx global>{`
        select { color-scheme: dark; }
        select option {
          background: #0b1020 !important;
          color: rgba(255,255,255,0.92) !important;
        }
      `}</style>

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
              相談履歴
            </div>
            <div className="mt-1 text-sm text-white/55">ここで「誰の履歴を見るか」を選べます。</div>
            <div className="mt-1 text-xs text-white/45">
              {scope ? `参考 scope：${scopeLabel(scope)}` : ""}
              {status && status !== "ok" ? ` / ${status}` : ""}
            </div>
          </header>

          <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-5">
            {/* 上段：誰の履歴を見るか */}
            <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className={chip(viewTarget === "all")} onClick={() => setViewTarget("all")}>
                  すべて
                </button>
                <button type="button" className={chip(viewTarget === "self")} onClick={() => setViewTarget("self")}>
                  自分
                </button>
                <button
                  type="button"
                  className={chip(viewTarget === "client")}
                  onClick={() => setViewTarget("client")}
                  disabled={profiles.length === 0}
                >
                  相談者（カルテ）
                </button>

                {viewTarget === "client" ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/55">→</span>
                    <select
                      value={selectedClientId}
                      onChange={(e) => setSelectedClientId(e.target.value)}
                      className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-white shadow-sm outline-none focus:border-white/20"
                    >
                      <option value="">（カルテを選択）</option>
                      {profiles
                        .filter((p) => p.is_active)
                        .map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.display_name}
                            {p.relationship_type ? ` / ${p.relationship_type}` : ""}
                          </option>
                        ))}
                    </select>
                  </div>
                ) : null}
              </div>

              <Link
                href="/welcome"
                className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
              >
                ホーム
              </Link>
            </div>

            {/* 検索・デッキ */}
            <div className="grid gap-3 md:grid-cols-3 md:items-end">
              <div>
                <div className="mb-2 text-xs font-semibold text-white/75">検索</div>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="タイトル / テーマ / 結果 / デッキ など"
                  className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                />
              </div>

              <div>
                <div className="mb-2 text-xs font-semibold text-white/75">デッキ</div>
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
                <div className="mt-2 text-[11px] text-white/45">※ deckFilter は mode に deckKey が入ってる想定</div>
              </div>

              <div className="flex items-center justify-between gap-2">
                <Link
                  href="/new"
                  className="w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/85 hover:bg-white/12"
                >
                  ＋ 新規鑑定
                </Link>
              </div>
            </div>

            {/* list */}
            <div className="mt-5 border-t border-white/10 pt-5">
              {booting ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  読み込み中…
                </div>
              ) : viewTarget === "client" && !selectedClientId ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  カルテを選ぶと、その人の履歴だけに絞れます。
                </div>
              ) : filtered.length === 0 ? (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                  該当する履歴がありません。
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((r) => (
                    <article key={r.id} className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="text-xs text-white/55">
                          {formatDt(r.created_at)} {r.mode ? ` / ${r.mode}` : ""} {r.target_type ? ` / ${r.target_type}` : ""}
                        </div>
                        <Link
                          href={`/read/${r.id}`}
                          className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                        >
                          開く
                        </Link>
                      </div>

                      <div
                        className="mt-2 text-lg font-semibold text-white"
                        style={{ fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif' }}
                      >
                        {r.title ?? "（無題）"}
                      </div>

                      {r.result_text ? (
                        <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm leading-7 text-white/70">
                          {r.result_text}
                        </p>
                      ) : (
                        <p className="mt-2 text-sm text-white/45">（結果テキストなし）</p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        {/* ✅ Footer（Welcomeと同型：下固定CTA） */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span className={chip(true)}>
                  {viewTarget === "all" ? "すべて" : viewTarget === "self" ? "自分" : "相談者"}
                </span>
                <span className={chip(viewTarget !== "client" || !!selectedClientId)}>
                  {viewTarget === "client"
                    ? selectedClientId
                      ? "カルテ選択済み"
                      : "カルテ未選択"
                    : "フィルタOK"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                <Link
                  href="/new"
                  className="rounded-2xl border border-white/18 bg-white/14 px-4 py-3 text-center text-sm font-semibold text-white hover:bg-white/18"
                >
                  新規鑑定
                </Link>

                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/chat"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    つづき相談
                  </Link>

                  <Link
                    href="/welcome"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    ホーム
                  </Link>
                </div>
              </div>
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