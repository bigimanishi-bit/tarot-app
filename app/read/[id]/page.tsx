// app/read/[id]/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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

export default function ReadDetailPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const id = params?.id;

  const [status, setStatus] = useState("loading...");
  const [row, setRow] = useState<ReadingRow | null>(null);
  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [openPayload, setOpenPayload] = useState(false);

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

      // ✅ 招待制チェック（/read と同じ）
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

      if (!id) {
        setStatus("No id");
        return;
      }

      // ✅ readings は自分の分だけ（/read と同じ）
      const { data, error } = await supabase
        .from("readings")
        .select("id, theme, title, cards_text, result_text, created_at")
        .eq("id", id)
        .eq("user_id", session.user.id)
        .single();

      if (cancelled) return;

      if (error) {
        setStatus("ERROR: " + error.message);
        return;
      }

      setRow((data ?? null) as ReadingRow | null);
      setStatus("OK");
    })();

    return () => {
      cancelled = true;
    };
  }, [id, router]);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.push("/login?reason=signed_out");
    }
  }

  const deckKey = row?.theme ?? "rws";
  const deckName = deckNameMap.get(deckKey) ?? deckKey;

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
                  fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                }}
              >
                Tarot Studio
              </h1>
              <p className="text-sm md:text-base text-slate-700">鑑定詳細（Reading）</p>
              <p className="text-xs md:text-sm text-slate-600">{row?.created_at ? formatDate(row.created_at) : status}</p>
            </div>
          </header>

          <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl md:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                    {deckName}
                  </span>
                  <span className="text-xs text-slate-600">{row?.id ? `ID: ${row.id}` : ""}</span>
                </div>

                <h2
                  className="mt-3 text-2xl font-semibold tracking-tight text-slate-900 md:text-3xl"
                  style={{
                    fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                  }}
                >
                  {row?.title ?? "鑑定詳細"}
                </h2>

                {!openPayload && row?.result_text ? (
                  <div className="mt-2 text-[11px] text-slate-500">
                    先頭プレビュー：{shortPreview(row.result_text, 180)}
                  </div>
                ) : null}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => router.push("/read")}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  一覧へ
                </button>

                <Link
                  href="/chat"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  チャットへ
                </Link>

                <Link
                  href="/new"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-100"
                >
                  ＋ 新規鑑定
                </Link>

                <button
                  type="button"
                  onClick={logout}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  ログアウト
                </button>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-5 lg:grid-cols-3">
              {/* READING */}
              <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm lg:col-span-2">
                <div className="mb-2 text-[11px] font-semibold tracking-widest text-slate-600">READING</div>

                {row?.result_text ? (
                  <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                    <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-900">
                      {row.result_text}
                    </div>
                  </div>
                ) : (
                  <div className="text-sm text-slate-600">鑑定結果がありません</div>
                )}
              </div>

              {/* 操作 */}
              <div className="rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                <div className="mb-3 text-sm font-bold text-slate-900">操作</div>

                <button
                  type="button"
                  onClick={() => setOpenPayload((v) => !v)}
                  className={clsx(
                    "w-full rounded-xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                    openPayload
                      ? "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100"
                      : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                  )}
                >
                  {openPayload ? "カード情報を隠す" : "カード情報を見る"}
                </button>

                <button
                  type="button"
                  onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  上へ
                </button>

                <button
                  type="button"
                  onClick={logout}
                  className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  ログアウト
                </button>
              </div>
            </div>

            {openPayload && row?.cards_text ? (
              <div className="mt-5 rounded-2xl border border-white/50 bg-white/68 p-5 shadow-sm">
                <div className="mb-2 text-[11px] font-semibold tracking-widest text-slate-600">PAYLOAD</div>
                <div className="rounded-2xl border border-slate-200 bg-white/80 p-4">
                  <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-slate-900">
                    {row.cards_text}
                  </pre>
                </div>
              </div>
            ) : null}
          </section>

          <div className="h-10" />
        </div>
      </div>
    </main>
  );
}