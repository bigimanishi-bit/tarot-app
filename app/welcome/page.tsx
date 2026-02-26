// app/welcome/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateDailyCards as getDailyCards } from "@/lib/dailyCards";
import {
  loadScope,
  saveScope,
  clearScope,
  isScopeReady,
  scopeLabel,
  type TarotScope,
} from "@/lib/scope";

type ClientProfileRow = {
  id: string;
  display_name: string;
  relationship_type: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_reading_at: string | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

export default function WelcomePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [profiles, setProfiles] = useState<ClientProfileRow[]>([]);
  const [q, setQ] = useState("");

  // ✅ useSearchParams をやめて window.location から読む
  const [nextPath, setNextPath] = useState<string | null>(null);

  // ✅ 今日のおすすめカード（3枚）
  const [dailyCards, setDailyCards] = useState<string[] | null>(null);

  // 新規登録フォーム
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setChecking(true);
      setErr(null);

      // ✅ next をクエリから拾う（CSRでだけ動く）
      try {
        const qs = new URLSearchParams(window.location.search);
        setNextPath(qs.get("next"));
      } catch {
        setNextPath(null);
      }

      // 1) ログイン確認
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setErr(sessionErr.message);
        setChecking(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      const email = session.user.email ?? null;
      setUserEmail(email);

      // ✅ 今日のおすすめ3枚（ユーザーIDベース）
      try {
        const uid = session.user.id;
       const daily = getDailyCards(uid);
setDailyCards(daily.cards);
      } catch {
        setDailyCards(null);
      }

      // 2) allowlist（招待制）チェック
      if (email) {
        const { data: allowedRows, error: allowErr } = await supabase
          .from("allowlist")
          .select("email")
          .eq("email", email)
          .eq("enabled", true)
          .limit(1);

        if (allowErr || !allowedRows?.[0]) {
          await supabase.auth.signOut();
          router.replace("/login?reason=invite_only");
          return;
        }
      }

      // 3) scope 読み込み
      const s = loadScope();
      setScope(s);

      // 4) client_profiles 読み込み（RLSでowner_user_idが効く前提）
      const { data: rows, error: profErr } = await supabase
        .from("client_profiles")
        .select(
          "id, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at"
        )
        .order("updated_at", { ascending: false });

      if (profErr) {
        setErr(`client_profiles 読み込みエラー: ${profErr.message}`);
      } else {
        setProfiles((rows ?? []) as ClientProfileRow[]);
      }

      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return profiles;
    return profiles.filter((p) => {
      const a = (p.display_name ?? "").toLowerCase();
      const b = (p.relationship_type ?? "").toLowerCase();
      const c = (p.memo ?? "").toLowerCase();
      return a.includes(t) || b.includes(t) || c.includes(t);
    });
  }, [profiles, q]);

  const ready = isScopeReady(scope);

  function chooseSelf() {
    const next: TarotScope = {
      targetType: "self",
      clientProfileId: null,
      clientDisplayName: null,
      updatedAt: Date.now(),
    };
    saveScope(next);
    setScope(next);
  }

  function chooseClient(p: ClientProfileRow) {
    const next: TarotScope = {
      targetType: "client",
      clientProfileId: p.id,
      clientDisplayName: p.display_name,
      updatedAt: Date.now(),
    };
    saveScope(next);
    setScope(next);
  }

  function resetScope() {
    clearScope();
    setScope(null);
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  async function createClient() {
    const name = newName.trim();
    if (!name) return;

    setCreating(true);
    setErr(null);

    try {
      const session = (await supabase.auth.getSession()).data.session;
      const uid = session?.user?.id;
      if (!uid) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      // client_code は DB側で作ってるなら不要。作ってないならここで適当に生成。
      const clientCode = `C-${new Date()
        .toISOString()
        .replace(/[-:TZ.]/g, "")
        .slice(0, 14)}-${Math.floor(Math.random() * 900 + 100)}`;

      const { data, error } = await supabase
        .from("client_profiles")
        .insert({
          owner_user_id: uid,
          client_code: clientCode,
          display_name: name,
          relationship_type: newRel.trim() || null,
          memo: newMemo.trim() || null,
          is_active: true,
        })
        .select(
          "id, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at"
        )
        .limit(1)
        .single();

      if (error) throw error;

      const row = data as ClientProfileRow;
      setProfiles((prev) => [row, ...prev]);
      setNewName("");
      setNewRel("");
      setNewMemo("");

      // 登録したらそのまま“選択状態”に（確定ボタン不要）
      chooseClient(row);
    } catch (e: any) {
      setErr(e?.message ?? "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  const primaryBtn = (enabled: boolean) =>
    clsx(
      "w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
      enabled
        ? "border-white/15 bg-white/10 text-white hover:bg-white/14"
        : "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
    );

  return (
    <main className="min-h-screen">
      {/* 背景：loginと同じ夜空系 */}
      <div className="relative min-h-screen overflow-hidden bg-[#0B1020]">
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(1200px 700px at 18% 22%, rgba(120,140,255,0.18), transparent 60%)," +
              "radial-gradient(900px 520px at 82% 30%, rgba(255,255,255,0.06), transparent 62%)," +
              "radial-gradient(1100px 700px at 50% 100%, rgba(0,0,0,0.55), transparent 60%)," +
              "linear-gradient(180deg, rgba(5,8,18,0.86) 0%, rgba(10,15,30,0.92) 35%, rgba(3,5,12,0.96) 100%)",
          }}
        />
        <Stars />
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{
            background:
              "radial-gradient(900px 450px at 30% 55%, rgba(255,255,255,0.05), transparent 60%)," +
              "radial-gradient(700px 360px at 70% 60%, rgba(255,255,255,0.035), transparent 58%)",
            filter: "blur(1px)",
          }}
        />

        {/* sticky header（PCでスクロールしても残る） */}
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
                <span
                  className="text-base font-semibold tracking-tight text-white md:text-lg"
                  style={{
                    fontFamily:
                      'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                  }}
                >
                  Tarot Studio
                </span>
                <span className="hidden rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold text-white/80 sm:inline-flex">
                  招待制 / Invite only
                </span>
              </Link>

              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-white/55 md:inline">
                  {checking ? "確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
                </span>
                <button
                  onClick={logout}
                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/12"
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
          {/* タイトル */}
          <header className="mb-6 md:mb-10">
            <h1
              className="text-4xl tracking-tight text-white md:text-6xl"
              style={{
                fontFamily:
                  'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif',
                textShadow: "0 10px 40px rgba(0,0,0,0.55)",
              }}
            >
              Welcome
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-white/75 md:text-base">
              ここでだけ、鑑定の“入れ物”を選びます。<br className="hidden md:block" />
              以降のページは自動で同じ入れ物を使い、混ざりません（プライバシー保護）。
            </p>
          </header>

          {/* エラー */}
          {err ? (
            <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              {err}
            </div>
          ) : null}

          {/* メイン（ガラス） */}
          <section className="rounded-[30px] border border-white/12 bg-white/6 p-3 shadow-[0_40px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-4 md:p-6">
            <div className="grid gap-4 md:grid-cols-2 md:gap-6">
              {/* 左：スコープ選択 */}
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm md:p-6">
                <div className="mb-4 flex items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/60">
                      SCOPE
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      今の選択：{scopeLabel(scope)}
                    </div>
                    <div className="mt-1 text-sm text-white/55">※切り替えはWelcomeだけ</div>
                  </div>

                  <button
                    onClick={resetScope}
                    className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/12"
                    type="button"
                  >
                    選択を消す
                  </button>
                </div>

                <div className="grid gap-3">
                  <button onClick={chooseSelf} className={primaryBtn(true)} type="button">
                    自分をみる（セルフ鑑定）
                  </button>

                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-sm font-semibold text-white/85">誰かをみる（カルテ）</div>
                    <div className="mt-1 text-sm leading-6 text-white/60">
                      一人ずつ完全に分けて記録。混ざりません。
                    </div>

                    <div className="mt-3">
                      <input
                        value={q}
                        onChange={(e) => setQ(e.target.value)}
                        placeholder="検索（名前 / 関係 / メモ）"
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                      />
                    </div>

                    <div className="mt-3 max-h-[280px] overflow-auto rounded-2xl border border-white/10">
                      {checking ? (
                        <div className="px-4 py-4 text-sm text-white/55">読み込み中…</div>
                      ) : filtered.length === 0 ? (
                        <div className="px-4 py-4 text-sm text-white/55">
                          まだカルテがありません。下で新規登録できます。
                        </div>
                      ) : (
                        <ul className="divide-y divide-white/10">
                          {filtered.map((p) => {
                            const active =
                              scope?.targetType === "client" && scope.clientProfileId === p.id;
                            return (
                              <li key={p.id} className="p-3">
                                <button
                                  type="button"
                                  onClick={() => chooseClient(p)}
                                  className={clsx(
                                    "w-full rounded-2xl border px-4 py-3 text-left transition",
                                    active
                                      ? "border-white/18 bg-white/12"
                                      : "border-white/10 bg-white/6 hover:bg-white/10"
                                  )}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="text-sm font-semibold text-white/90">
                                      {p.display_name}
                                    </div>
                                    <span className="text-xs text-white/50">
                                      {p.relationship_type ?? ""}
                                    </span>
                                  </div>
                                  {p.memo ? (
                                    <div className="mt-2 line-clamp-2 text-sm text-white/60">
                                      {p.memo}
                                    </div>
                                  ) : null}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>

                    {/* 新規登録 */}
                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white/85">新規登録（カルテ）</div>

                      <div className="mt-3 grid gap-3">
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="表示名（例：Aさん）"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                        />
                        <input
                          value={newRel}
                          onChange={(e) => setNewRel(e.target.value)}
                          placeholder="関係（任意：恋人/家族/同僚など）"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                        />
                        <textarea
                          value={newMemo}
                          onChange={(e) => setNewMemo(e.target.value)}
                          rows={3}
                          placeholder="事情メモ（任意：あとから追記して育てる）"
                          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                        />

                        <button
                          type="button"
                          onClick={createClient}
                          disabled={creating || !newName.trim()}
                          className={primaryBtn(!creating && !!newName.trim())}
                        >
                          {creating ? "作成中…" : "カルテを作って選択する"}
                        </button>

                        <div className="text-xs text-white/45">
                          ※作成したら自動で選択状態になります（確定ボタン不要）
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* 右：行き先（スコープが決まるまで押せない） */}
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm md:p-6">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/60">
                    START
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">次にすること</div>
                  <p className="mt-2 text-sm text-white/65">
                    どのページでも、鑑定の入れ物はこの選択が自動適用されます。
                    <br />
                    変更したい時だけ、Welcomeに戻ってください。
                  </p>
                </div>

                <div className="grid gap-3">
                  <Link
                    href="/new"
                    className={primaryBtn(ready)}
                    aria-disabled={!ready}
                    onClick={(e) => {
                      if (!ready) e.preventDefault();
                    }}
                  >
                    新規鑑定（New）
                  </Link>

                  <Link
                    href="/read"
                    className={primaryBtn(ready)}
                    aria-disabled={!ready}
                    onClick={(e) => {
                      if (!ready) e.preventDefault();
                    }}
                  >
                    履歴（Read）
                  </Link>

                  <Link
                    href="/chat"
                    className={primaryBtn(ready)}
                    aria-disabled={!ready}
                    onClick={(e) => {
                      if (!ready) e.preventDefault();
                    }}
                  >
                    相談（Chat）
                  </Link>

                  {nextPath ? (
                    <Link
                      href={nextPath}
                      className={primaryBtn(ready)}
                      aria-disabled={!ready}
                      onClick={(e) => {
                        if (!ready) e.preventDefault();
                      }}
                    >
                      さっきのページへ戻る
                    </Link>
                  ) : null}
                </div>

                {!ready ? (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                    まず「自分」か「カルテ」を選んでください。<br />
                    （安全のため、未選択のまま他ページは開けません）
                  </div>
                ) : (
                  <div className="mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/70">
                    選択OK：<span className="font-semibold text-white">{scopeLabel(scope)}</span>
                    <br />
                    このまま鑑定へ進めます。
                  </div>
                )}

                {/* ✅ 今日のカード（おすすめ） */}
                <div className="mt-6 rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-sm font-semibold text-white/85">今日のカード（おすすめ）</div>

                  {!dailyCards ? (
                    <div className="mt-2 text-sm text-white/60">（まだありません）</div>
                  ) : (
                    <ul className="mt-2 space-y-1 text-sm text-white/80">
                      <li>1: {dailyCards[0]}</li>
                      <li>2: {dailyCards[1]}</li>
                      <li>3: {dailyCards[2]}</li>
                    </ul>
                  )}
                </div>

                <div className="mt-6 flex items-center justify-between text-xs text-white/45">
                  <span>Tarot Studio / private beta</span>
                  <span>静かに、深く。</span>
                </div>
              </div>
            </div>
          </section>

          <div className="h-10" />
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