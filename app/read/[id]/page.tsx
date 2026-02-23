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
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setStatus("ERROR session: " + sessionErr.message);
        return;
      }

      if (!sessionData.session) {
        router.push("/login?reason=not_logged_in");
        return;
      }

      const { data: deckRows, error: deckErr } = await supabase
        .from("deck_library")
        .select("key, name")
        .eq("enabled", true)
        .order("name", { ascending: true });

      if (deckErr) {
        setStatus("ERROR deck_library: " + deckErr.message);
        return;
      }

      setDecks((deckRows ?? []) as DeckRow[]);

      if (!id) {
        setStatus("No id");
        return;
      }

      const { data, error } = await supabase
        .from("readings")
        .select("id, theme, title, cards_text, result_text, created_at")
        .eq("id", id)
        .single();

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
    <main className="min-h-screen text-white">
      <style>{`
        :root{
          --gold: 226, 180, 92;
          --amber: 255, 196, 120;
          --vio: 160, 110, 255;
          --cya:  90, 220, 255;
          --bd: rgba(255,255,255,.12);
          --bd2: rgba(255,255,255,.20);
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
          border: 1px solid rgba(var(--gold), .38);
          background: linear-gradient(180deg, rgba(var(--gold), .16), rgba(var(--gold), .08));
          color: rgba(255,240,220,.95);
        }

        .reading{
          background: rgba(0,0,0,.42);
          border: 1px solid rgba(255,255,255,.12);
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
        <div className="goldEdge glass rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[11px] tracking-[.18em] text-white/80">
                  Tarot Studio
                </span>
                <span className="text-[12px] text-white/45">Reading</span>
              </div>

              <h1 className="heroTitle mt-4 text-2xl sm:text-3xl font-semibold">
                {row?.title ?? "鑑定詳細"}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-2">
                <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs text-white/85">
                  {deckName}
                </span>
                <span className="text-xs text-white/55">
                  {row?.created_at ? formatDate(row.created_at) : status}
                </span>
              </div>
            </div>

            {/* ✅ 枠外ナビの原因だった “pill” 行は完全撤去。枠内だけに統一 */}
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => router.push("/read")}
                className="btn rounded-2xl px-5 py-3 text-sm text-white/90"
              >
                一覧へ
              </button>

              <Link href="/chat" className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
                チャットへ
              </Link>

              <Link href="/new" className="btn btnGold rounded-2xl px-5 py-3 text-sm font-semibold">
                ＋ 新規鑑定
              </Link>

              <button type="button" onClick={logout} className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
                ログアウト
              </button>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="goldEdge glass rounded-[22px] p-4 lg:col-span-2">
              <div className="mb-2 text-[11px] font-semibold tracking-widest text-white/60">
                READING
              </div>
              {row?.result_text ? (
                <div className="reading rounded-2xl p-4">
                  <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-white/92">
                    {row.result_text}
                  </div>
                </div>
              ) : (
                <div className="text-sm text-white/60">鑑定結果がありません</div>
              )}
            </div>

            <div className="goldEdge glass rounded-[22px] p-4">
              <div className="mb-3 text-sm font-semibold text-white/90">操作</div>

              <button
                type="button"
                onClick={() => setOpenPayload((v) => !v)}
                className={clsx("btn w-full rounded-2xl px-4 py-3 text-sm", openPayload ? "btnGold" : "text-white/90")}
              >
                {openPayload ? "カード情報を隠す" : "カード情報を見る"}
              </button>

              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="btn mt-2 w-full rounded-2xl px-4 py-3 text-sm text-white/90"
              >
                上へ
              </button>

              <button
                type="button"
                onClick={logout}
                className="btn mt-2 w-full rounded-2xl px-4 py-3 text-sm text-white/90"
              >
                ログアウト
              </button>

              <div className="mt-4 text-xs text-white/45">
                ID: <span className="text-white/70">{row?.id ?? "-"}</span>
              </div>
            </div>
          </div>

          {openPayload && row?.cards_text ? (
            <div className="mt-5 goldEdge glass rounded-[22px] p-4">
              <div className="mb-2 text-[11px] font-semibold tracking-widest text-white/60">
                PAYLOAD
              </div>
              <div className="reading rounded-2xl p-4">
                <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/78">
                  {row.cards_text}
                </pre>
              </div>
            </div>
          ) : null}

          {!openPayload && row?.result_text ? (
            <div className="mt-4 text-[11px] text-white/45">
              先頭プレビュー：{shortPreview(row.result_text, 180)}
            </div>
          ) : null}
        </div>
      </div>
    </main>
  );
}