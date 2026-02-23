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

        .field{
          border: 1px solid rgba(255,255,255,.16);
          background: rgba(0,0,0,.28);
          outline: none;
        }
        .field:focus{ border-color: rgba(255,255,255,.28); }

        .reading{
          background: rgba(0,0,0,.42);
          border: 1px solid rgba(255,255,255,.12);
        }

        .lift{ transition: transform .18s ease, border-color .18s ease, box-shadow .18s ease; }
        .lift:hover{
          transform: translateY(-2px);
          border-color: var(--bd2);
          box-shadow: 0 28px 90px rgba(0,0,0,.68), inset 0 1px 0 rgba(255,255,255,.07);
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
        {/* ✅ 枠外のナビ（pills）は削除。ここには何も置かない */}

        <div className="goldEdge glass rounded-[28px] p-5 sm:p-7">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-white/15 bg-black/25 px-4 py-2 text-[11px] tracking-[.18em] text-white/80">
                  Tarot Studio
                </span>
                <span className="text-[12px] text-white/45">History</span>
              </div>

              <h1 className="heroTitle mt-4 text-3xl sm:text-4xl font-semibold">鑑定履歴</h1>
              <div className="mt-3 text-sm text-white/70">{status}</div>
            </div>

            {/* ✅ 枠内だけに操作を集約（重複を消す） */}
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/new" className="btn btnGold rounded-2xl px-5 py-3 text-sm font-semibold">
                ＋ 新規鑑定
              </Link>
              <Link href="/chat" className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
                チャットへ
              </Link>
              <button
                type="button"
                onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}
                className="btn rounded-2xl px-5 py-3 text-sm text-white/90"
              >
                上へ
              </button>
              <button type="button" onClick={logout} className="btn rounded-2xl px-5 py-3 text-sm text-white/90">
                ログアウト
              </button>
            </div>
          </div>

          <div className="mt-7 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="goldEdge glass rounded-[22px] p-4">
              <div className="text-xs text-white/60">総件数</div>
              <div className="mt-2 text-3xl font-semibold text-white/90">{stats.total}</div>
            </div>
            <div className="goldEdge glass rounded-[22px] p-4">
              <div className="text-xs text-white/60">デッキ数</div>
              <div className="mt-2 text-3xl font-semibold text-white/90">{stats.uniqDecks}</div>
            </div>
            <div className="goldEdge glass rounded-[22px] p-4">
              <div className="text-xs text-white/60">最新</div>
              <div className="mt-3 text-sm font-semibold text-white/85">{stats.last}</div>
            </div>
          </div>
        </div>

        <div className="mt-7 grid grid-cols-1 gap-6 lg:grid-cols-4">
          <aside className="lg:col-span-1 space-y-4">
            <div className="goldEdge glass rounded-[24px] p-4">
              <div className="text-sm font-semibold text-white/90">検索</div>
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="タイトル / 結果 / デッキ / payload"
                className="field mt-3 w-full rounded-2xl px-4 py-3 text-sm text-white placeholder:text-white/35"
              />
              <div className="mt-2 text-[11px] text-white/45">例：恋愛 / 仕事 / rws / after …</div>
            </div>

            <div className="goldEdge glass rounded-[24px] p-4">
              <div className="text-sm font-semibold text-white/90">ショートカット</div>
              <div className="mt-3 space-y-2">
                {deckShortcuts.map((k) => {
                  const active = deckFilter === k;
                  const label = k === "all" ? "全デッキ" : deckNameMap.get(k) ?? k;
                  return (
                    <button
                      key={k}
                      type="button"
                      onClick={() => setDeckFilter(k)}
                      className={clsx("btn w-full rounded-2xl px-3 py-3 text-left text-xs", active ? "btnGold" : "text-white/85")}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* ✅ 左下「絞り込み（select）」は削除（ショートカットと被る） */}
          </aside>

          <section className="lg:col-span-3">
            <div className="goldEdge glass rounded-[28px] p-4 sm:p-5">
              {filtered.length === 0 ? (
                <div className="goldEdge glass rounded-[24px] p-6">
                  <div className="text-sm font-semibold text-white/90">まだ履歴がありません</div>
                  <div className="mt-2 text-xs text-white/55">「新規鑑定」から作ると、ここに溜まります。</div>
                  <div className="mt-4">
                    <Link href="/new" className="btn btnGold inline-flex rounded-2xl px-5 py-3 text-sm font-semibold">
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
                      <article key={r.id} className="goldEdge glass lift rounded-[26px] p-5">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <span className="rounded-full border border-white/15 bg-black/25 px-3 py-1 text-xs text-white/85">
                              {dn}
                            </span>
                            <span className="text-xs text-white/55">{formatDate(r.created_at)}</span>
                          </div>

                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setOpenCardsId(opened ? null : r.id)}
                              className="btn rounded-2xl px-4 py-2 text-xs text-white/90"
                            >
                              {opened ? "カードを隠す" : "カードを見る"}
                            </button>

                            <Link href={`/read/${r.id}`} className="btn btnGold rounded-2xl px-4 py-2 text-xs font-semibold">
                              開く
                            </Link>
                          </div>
                        </div>

                        <h2 className="mt-3 text-lg sm:text-xl font-semibold tracking-tight text-white/95">{title}</h2>

                        {result ? (
                          <div className="mt-3 text-sm leading-relaxed text-white/85">
                            {shortPreview(result, 220)}
                          </div>
                        ) : (
                          <div className="mt-3 text-sm text-white/60">鑑定結果がありません</div>
                        )}

                        {opened && r.cards_text ? (
                          <div className="reading mt-4 rounded-2xl p-4">
                            <div className="mb-2 text-[11px] font-semibold tracking-widest text-white/60">
                              PAYLOAD
                            </div>
                            <pre className="whitespace-pre-wrap break-words font-sans text-xs leading-relaxed text-white/78">
                              {r.cards_text}
                            </pre>
                          </div>
                        ) : null}
                      </article>
                    );
                  })}
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}