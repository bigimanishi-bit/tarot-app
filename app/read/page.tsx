// app/read/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ReadingRow = {
  id: string;
  theme: string | null;
  title: string | null;
  cards_text: string | null;
  result_text: string | null;
  created_at: string;
};

type DeckRow = { key: string; name: string };

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
function shortPreview(s: string, n: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export default function ReadPage() {
  const router = useRouter();

  const [status, setStatus] = useState("loading...");
  const [rows, setRows] = useState<ReadingRow[]>([]);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deckFilter, setDeckFilter] = useState<string>("all");
  const [q, setQ] = useState("");
  const [openCardsId, setOpenCardsId] = useState<string | null>(null);

  const deckNameMap = useMemo(() => {
    const m = new Map<string, string>();
    decks.forEach((d) => m.set(d.key, d.name));
    return m;
  }, [decks]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus("loading...");

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setStatus("ERROR session: " + sessionErr.message);
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

      // ✅ 招待制チェック
      const { data: allowedRows, error: allowErr } = await supabase
        .from("allowlist")
        .select("email")
        .eq("email", email)
        .eq("enabled", true)
        .limit(1);

      if (cancelled) return;

      if (allowErr || !allowedRows?.[0]) {
        await supabase.auth.signOut();
        router.push("/login?reason=invite_only");
        return;
      }

      const { data: deckRows, error: deckErr } = await supabase
        .from("deck_library")
        .select("key, name")
        .eq("enabled", true)
        .order("name", { ascending: true });

      if (cancelled) return;

      if (deckErr) {
        setStatus("ERROR deck_library: " + deckErr.message);
        return;
      }
      setDecks((deckRows ?? []) as DeckRow[]);

      // ✅ readings は自分の分だけ
      const { data, error } = await supabase
        .from("readings")
        .select("id, theme, title, cards_text, result_text, created_at")
        .eq("user_id", session.user.id)
        .order("created_at", { ascending: false })
        .limit(200);

      if (cancelled) return;

      if (error) {
        setStatus("ERROR readings: " + error.message);
        return;
      }

      setRows((data ?? []) as ReadingRow[]);
      setStatus(`OK. ${data?.length ?? 0} readings`);
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

  const stats = useMemo(() => {
    const total = rows.length;
    const byDeck = new Map<string, number>();
    rows.forEach((r) => {
      const k = r.theme ?? "rws";
      byDeck.set(k, (byDeck.get(k) ?? 0) + 1);
    });
    const uniqDecks = byDeck.size;
    const last = rows[0]?.created_at ? formatDate(rows[0].created_at) : "-";
    return { total, uniqDecks, last };
  }, [rows]);

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return rows.filter((r) => {
      const dk = (r.theme ?? "rws").toLowerCase();
      const title = (r.title ?? "").toLowerCase();
      const result = (r.result_text ?? "").toLowerCase();
      const cards = (r.cards_text ?? "").toLowerCase();
      if (deckFilter !== "all" && (r.theme ?? "rws") !== deckFilter) return false;
      if (!kw) return true;
      return dk.includes(kw) || title.includes(kw) || result.includes(kw) || cards.includes(kw);
    });
  }, [rows, deckFilter, q]);

  const deckShortcuts = useMemo(() => ["all", ...decks.map((d) => d.key)], [decks]);

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
        <div className="mx-auto w-full max-w-6xl px-6 py-10 md:py-14">
          {/* ヘッダー（login/new と同じ） */}
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
              <p className="text-sm md:text-base text-slate-700">鑑定履歴（History）</p>
              <p className="text-xs md:text-sm text-slate-600">{status}</p>
            </div>
          </header>

          {/* 上のガラス枠 */}
          <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  History
                </span>
                <span className="text-sm text-slate-600">保存された鑑定を一覧できます</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/new"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-100"
                >
                  ＋ 新規鑑定
                </Link>
                <Link
                  href="/chat"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  チャットへ
                </Link>
                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  上へ
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

            <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="rounded-2xl border border-white/50 bg-white/68 p-4 shadow-sm">
                <div className="text-xs text-slate-600">総件数</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{stats.total}</div>
              </div>
              <div className="rounded-2xl border border-white/50 bg-white/68 p-4 shadow-sm">
                <div className="text-xs text-slate-600">デッキ数</div>
                <div className="mt-2 text-3xl font-semibold text-slate-900">{stats.uniqDecks}</div>
              </div>
              <div className="rounded-2xl border border-white/50 bg-white/68 p-4 shadow-sm">
                <div className="text-xs text-slate-600">最新</div>
                <div className="mt-3 text-sm font-semibold text-slate-900">{stats.last}</div>
              </div>
            </div>
          </section>

          {/* 下：検索＋一覧 */}
          <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-4">
            <aside className="lg:col-span-1 space-y-4">
              <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-900">検索</div>
                <input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="タイトル / 結果 / デッキ / payload"
                  className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
                />
                <div className="mt-2 text-[11px] text-slate-500">例：恋愛 / 仕事 / rws / after …</div>
              </div>

              <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                <div className="text-sm font-bold text-slate-900">デッキ</div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {deckShortcuts.map((k) => {
                    const active = deckFilter === k;
                    const label = k === "all" ? "全デッキ" : deckNameMap.get(k) ?? k;
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={() => setDeckFilter(k)}
                        className={clsx(
                          "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition",
                          active
                            ? "border-amber-200 bg-amber-50 text-slate-900"
                            : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                        )}
                      >
                        {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </aside>

            <section className="lg:col-span-3">
              <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl sm:p-5">
                {filtered.length === 0 ? (
                  <div className="rounded-2xl border border-white/50 bg-white/68 p-6 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">まだ履歴がありません</div>
                    <div className="mt-2 text-xs text-slate-600">「新規鑑定」から作ると、ここに溜まります。</div>
                    <div className="mt-4">
                      <Link
                        href="/new"
                        className="inline-flex rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm hover:bg-amber-100"
                      >
                        ＋ 新規鑑定
                      </Link>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {filtered.map((r) => {
                      const dk = r.theme ?? "rws";
                      const dn = deckNameMap.get(dk) ?? dk;
                      const opened = openCardsId === r.id;
                      const title = r.title || "タイトルなし";
                      const result = r.result_text ?? "";

                      return (
                        <article key={r.id} className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="flex items-center gap-2">
                              <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                                {dn}
                              </span>
                              <span className="text-xs text-slate-500">{formatDate(r.created_at)}</span>
                            </div>

                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => setOpenCardsId(opened ? null : r.id)}
                                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                              >
                                {opened ? "カードを隠す" : "カードを見る"}
                              </button>

                              <Link
                                href={`/read/${r.id}`}
                                className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-xs font-semibold text-slate-900 shadow-sm hover:bg-amber-100"
                              >
                                開く
                              </Link>
                            </div>
                          </div>

                          <h2 className="mt-3 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">
                            {title}
                          </h2>

                          {result ? (
                            <div className="mt-3 text-sm leading-relaxed text-slate-700">
                              {shortPreview(result, 220)}
                            </div>
                          ) : (
                            <div className="mt-3 text-sm text-slate-600">鑑定結果がありません</div>
                          )}

                          {opened && r.cards_text ? (
                            <div className="mt-4 rounded-2xl border border-slate-200 bg-white/80 p-4">
                              <div className="mb-2 text-[11px] font-semibold tracking-widest text-slate-600">
                                PAYLOAD
                              </div>
                              <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-800">
                                {r.cards_text}
                              </pre>
                            </div>
                          ) : null}
                        </article>
                      );
                    })}
                  </div>
                )}
              </section>
            </section>
          </div>

          <div className="h-10" />
        </div>
      </div>
    </main>
  );
}