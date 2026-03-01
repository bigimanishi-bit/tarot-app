// app/maintain/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";

type ClientProfileRow = {
  id: string;
  owner_user_id: string;
  client_code: string;
  display_name: string;
  relationship_type: string | null;
  memo: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_reading_at: string | null;
};

type ClientNoteRow = {
  id: string;
  client_profile_id: string;
  owner_user_id: string;
  note: string;
  created_at: string;
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

function makeClientCode() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `C-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(
    d.getHours()
  )}${pad(d.getMinutes())}${pad(d.getSeconds())}-${d.getMilliseconds()}`;
}

function pickClientLabel(c: ClientProfileRow) {
  const n = (c.display_name ?? "").trim();
  return n ? n : c.client_code;
}

export default function MaintainPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [clients, setClients] = useState<ClientProfileRow[]>([]);
  const [loadingClients, setLoadingClients] = useState(false);
  const [q, setQ] = useState("");
  const [filterActive, setFilterActive] = useState<"active" | "all">("active");

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = useMemo(
    () => clients.find((c) => c.id === selectedId) ?? null,
    [clients, selectedId]
  );

  // 編集フォーム（選択した人だけ）
  const [editName, setEditName] = useState("");
  const [editRel, setEditRel] = useState("");
  const [editMemo, setEditMemo] = useState("");

  // 新規作成
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [creating, setCreating] = useState(false);

  // 事情追記
  const [notes, setNotes] = useState<ClientNoteRow[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [addingNote, setAddingNote] = useState(false);

  function pushToast(s: string) {
    setToast(s);
    window.setTimeout(() => setToast(null), 2200);
  }

  // ✅ auth + allowlist
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setCheckingAuth(true);
      setErr(null);

      const { data: sessionData, error: sessionErr } =
        await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setErr(sessionErr.message);
        setCheckingAuth(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.push("/login?reason=not_logged_in");
        return;
      }

      const email = session.user.email ?? null;
      const uid = session.user.id ?? null;

      if (!email) {
        await supabase.auth.signOut();
        router.push("/login?reason=no_email");
        return;
      }

      const { data: allowedRows, error: allowErr } = await supabase
        .from("allowlist")
        .select("email")
        .eq("email", email)
        .eq("enabled", true)
        .limit(1);

      if (allowErr || !allowedRows?.[0]) {
        await supabase.auth.signOut();
        router.push("/login?reason=invite_only");
        return;
      }

      setUserEmail(email);
      setUserId(uid);
      setCheckingAuth(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  async function loadClients(uid: string) {
    setLoadingClients(true);
    setErr(null);

    const { data, error } = await supabase
      .from("client_profiles")
      .select(
        "id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at"
      )
      .eq("owner_user_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      setErr("client_profiles 読み込みエラー: " + error.message);
      setClients([]);
      setLoadingClients(false);
      return;
    }

    setClients((data ?? []) as ClientProfileRow[]);
    setLoadingClients(false);
  }

  async function loadNotes(uid: string, clientId: string) {
    setLoadingNotes(true);
    setErr(null);

    const { data, error } = await supabase
      .from("client_notes")
      .select("id, client_profile_id, owner_user_id, note, created_at")
      .eq("owner_user_id", uid)
      .eq("client_profile_id", clientId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      setErr("client_notes 読み込みエラー: " + error.message);
      setNotes([]);
      setLoadingNotes(false);
      return;
    }

    setNotes((data ?? []) as ClientNoteRow[]);
    setLoadingNotes(false);
  }

  // 初回ロード
  useEffect(() => {
    if (!userId) return;
    loadClients(userId);
  }, [userId]);

  // 選択が変わったらフォーム同期＋事情ログ読み込み
  useEffect(() => {
    if (!selected) {
      setEditName("");
      setEditRel("");
      setEditMemo("");
      setNotes([]);
      setNewNote("");
      return;
    }
    setEditName(selected.display_name ?? "");
    setEditRel(selected.relationship_type ?? "");
    setEditMemo(selected.memo ?? "");
    if (userId) loadNotes(userId, selected.id);
  }, [selectedId]); // eslint-disable-line react-hooks/exhaustive-deps

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    return clients.filter((c) => {
      if (filterActive === "active" && !c.is_active) return false;
      if (!kw) return true;
      const label = pickClientLabel(c).toLowerCase();
      const memo = (c.memo ?? "").toLowerCase();
      const rel = (c.relationship_type ?? "").toLowerCase();
      const code = (c.client_code ?? "").toLowerCase();
      return (
        label.includes(kw) ||
        memo.includes(kw) ||
        rel.includes(kw) ||
        code.includes(kw) ||
        c.id.toLowerCase().includes(kw)
      );
    });
  }, [clients, q, filterActive]);

  async function createClient() {
    if (!userId) return;
    if (creating) return;

    const name = newName.trim();
    if (!name) {
      setErr("新規：表示名は必須です");
      return;
    }

    setCreating(true);
    setErr(null);

    const payload = {
      owner_user_id: userId,
      client_code: makeClientCode(),
      display_name: name,
      relationship_type: newRel.trim() ? newRel.trim() : null,
      memo: newMemo.trim() ? newMemo.trim() : null,
      is_active: true,
    };

    const ins = await supabase
      .from("client_profiles")
      .insert(payload)
      .select(
        "id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at"
      )
      .limit(1);

    if (ins.error) {
      setErr("新規カルテ作成エラー: " + ins.error.message);
      setCreating(false);
      return;
    }

    const row = (ins.data?.[0] ?? null) as ClientProfileRow | null;
    if (!row?.id) {
      setErr("新規カルテ作成に失敗（ID取得できず）");
      setCreating(false);
      return;
    }

    setClients((prev) => [row, ...prev]);
    setSelectedId(row.id);

    setNewName("");
    setNewRel("");
    setNewMemo("");
    setShowCreate(false);

    pushToast("新規カルテを作成しました");
    setCreating(false);
  }

  async function saveProfile() {
    if (!userId || !selected) return;

    const name = editName.trim();
    if (!name) {
      setErr("表示名は必須です");
      return;
    }

    setErr(null);

    const upd = await supabase
      .from("client_profiles")
      .update({
        display_name: name,
        relationship_type: editRel.trim() ? editRel.trim() : null,
        memo: editMemo.trim() ? editMemo.trim() : null,
      })
      .eq("id", selected.id)
      .eq("owner_user_id", userId)
      .select(
        "id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at"
      )
      .limit(1);

    if (upd.error) {
      setErr("更新エラー: " + upd.error.message);
      return;
    }

    const row = (upd.data?.[0] ?? null) as ClientProfileRow | null;
    if (!row) {
      setErr("更新に失敗しました");
      return;
    }

    setClients((prev) => prev.map((c) => (c.id === row.id ? row : c)));
    pushToast("カルテを更新しました");
  }

  async function setActive(next: boolean) {
    if (!userId || !selected) return;

    setErr(null);

    const upd = await supabase
      .from("client_profiles")
      .update({ is_active: next })
      .eq("id", selected.id)
      .eq("owner_user_id", userId)
      .select(
        "id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at"
      )
      .limit(1);

    if (upd.error) {
      setErr("更新エラー: " + upd.error.message);
      return;
    }

    const row = (upd.data?.[0] ?? null) as ClientProfileRow | null;
    if (!row) {
      setErr("更新に失敗しました");
      return;
    }

    setClients((prev) => prev.map((c) => (c.id === row.id ? row : c)));
    pushToast(next ? "有効にしました" : "停止しました");
  }

  async function addNote() {
    if (!userId || !selected) return;
    if (addingNote) return;

    const t = newNote.trim();
    if (!t) return;

    setAddingNote(true);
    setErr(null);

    const ins = await supabase
      .from("client_notes")
      .insert({
        owner_user_id: userId,
        client_profile_id: selected.id,
        note: t,
      })
      .select("id, client_profile_id, owner_user_id, note, created_at")
      .limit(1);

    if (ins.error) {
      setErr("事情追記エラー: " + ins.error.message);
      setAddingNote(false);
      return;
    }

    const row = (ins.data?.[0] ?? null) as ClientNoteRow | null;
    if (!row) {
      setErr("事情追記に失敗しました");
      setAddingNote(false);
      return;
    }

    setNotes((prev) => [row, ...prev]);
    setNewNote("");
    pushToast("事情を追記しました");
    setAddingNote(false);
  }

  async function deleteNote(noteId: string) {
    if (!userId || !selected) return;

    const ok = window.confirm("この追記事情を削除します。よろしいですか？");
    if (!ok) return;

    setErr(null);

    const del = await supabase
      .from("client_notes")
      .delete()
      .eq("id", noteId)
      .eq("owner_user_id", userId)
      .eq("client_profile_id", selected.id);

    if (del.error) {
      setErr("削除エラー: " + del.error.message);
      return;
    }

    setNotes((prev) => prev.filter((n) => n.id !== noteId));
    pushToast("追記事情を削除しました");
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  const disableSave = !selected || !editName.trim();
  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on
        ? "border-white/18 bg-white/12 text-white"
        : "border-white/10 bg-white/6 text-white/60"
    );

  return (
    <main className="min-h-screen">
      <div className="relative min-h-screen overflow-hidden bg-[#0B1020] text-white">
        {/* Welcomeと同じ背景レイヤー */}
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

        {/* header（Welcomeと同型） */}
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
                  Maintain
                </span>
              </Link>

              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-white/55 md:inline">
                  {checkingAuth
                    ? "確認中…"
                    : userEmail
                    ? `ログイン中：${userEmail}`
                    : ""}
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

        {/* 下固定CTAのぶん余白 */}
        <div className="relative mx-auto max-w-6xl px-4 py-7 pb-28 md:px-6 md:py-10 md:pb-32">
          {toast ? (
            <div className="mb-4 rounded-2xl border border-amber-300/20 bg-amber-500/10 px-5 py-4 text-sm text-amber-50">
              {toast}
            </div>
          ) : null}

          {err ? (
            <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              <div className="font-semibold">ERROR</div>
              <div className="mt-1">{err}</div>
            </div>
          ) : null}

          {/* Body */}
          <div className="grid gap-4 lg:grid-cols-4 lg:gap-6">
            {/* 左：一覧 */}
            <aside className="lg:col-span-1 space-y-4 lg:sticky lg:top-[84px] self-start">
              <div className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
                <div className="rounded-[22px] border border-white/10 bg-white/7 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-white/90">カルテ</div>
                    <div className="text-xs text-white/55">
                      {loadingClients ? "読み込み中…" : `${clients.length} 件`}
                    </div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterActive("active")}
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition",
                        filterActive === "active"
                          ? "border-white/18 bg-white/14 text-white"
                          : "border-white/12 bg-white/8 text-white/80 hover:bg-white/12"
                      )}
                    >
                      有効のみ
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterActive("all")}
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm transition",
                        filterActive === "all"
                          ? "border-white/18 bg-white/14 text-white"
                          : "border-white/12 bg-white/8 text-white/80 hover:bg-white/12"
                      )}
                    >
                      全部
                    </button>
                  </div>

                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="検索（名前/関係/メモ/コード）"
                    className="mt-3 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                  />

                  <button
                    type="button"
                    onClick={() => setShowCreate((v) => !v)}
                    className="mt-3 w-full rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                  >
                    ＋ 新規カルテ
                  </button>

                  {showCreate ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/6 p-3">
                      <div className="text-xs font-semibold tracking-[0.18em] text-white/55">
                        CREATE
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-white/60">表示名（必須）</div>
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                          placeholder="例：Aさん"
                        />
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-white/60">関係性（任意）</div>
                        <input
                          value={newRel}
                          onChange={(e) => setNewRel(e.target.value)}
                          className="mt-1 w-full rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                          placeholder="例：友人 / 恋人 / 家族"
                        />
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-white/60">メモ（任意）</div>
                        <textarea
                          value={newMemo}
                          onChange={(e) => setNewMemo(e.target.value)}
                          rows={3}
                          className="mt-1 w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm leading-7 text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                          placeholder="固定で残しておきたい要点"
                        />
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={createClient}
                          disabled={creating || !newName.trim()}
                          className={clsx(
                            "flex-1 rounded-2xl border px-3 py-2 text-sm font-semibold shadow-sm transition",
                            creating || !newName.trim()
                              ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                              : "border-white/18 bg-white/14 text-white hover:bg-white/18"
                          )}
                        >
                          {creating ? "作成中…" : "作成"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCreate(false)}
                          className="rounded-2xl border border-white/12 bg-white/8 px-3 py-2 text-sm font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-2">
                    {filtered.length === 0 ? (
                      <div className="p-4 text-sm text-white/55">該当なし</div>
                    ) : (
                      <div className="space-y-2">
                        {filtered.map((c) => {
                          const active = c.id === selectedId;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => setSelectedId(c.id)}
                              className={clsx(
                                "w-full rounded-2xl border p-3 text-left shadow-sm transition",
                                active
                                  ? "border-white/25 bg-white/16 text-white"
                                  : "border-white/10 bg-white/6 text-white/85 hover:bg-white/10"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold">
                                  {pickClientLabel(c)}
                                </div>
                                {!c.is_active ? (
                                  <span className="rounded-full border border-white/15 bg-white/10 px-2 py-0.5 text-[11px] font-semibold text-white/70">
                                    停止
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] text-white/55">
                                code: {c.client_code}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </aside>

            {/* 右：詳細 */}
            <section className="lg:col-span-3 space-y-4">
              {!selected ? (
                <div className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-6">
                  <div className="rounded-2xl border border-white/10 bg-white/7 px-5 py-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">
                      MAINTAIN
                    </div>
                    <div className="mt-2 text-lg font-semibold text-white">
                      左からカルテを選んでください
                    </div>
                    <div className="mt-1 text-sm text-white/55">
                      編集・停止・事情ログはここでまとめて管理します。
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  {/* 編集 */}
                  <div className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-6">
                    <div className="mb-4 rounded-2xl border border-white/10 bg-white/7 px-5 py-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold tracking-[0.18em] text-white/55">
                            PROFILE
                          </div>
                          <div className="mt-2 text-xl font-semibold text-white">
                            {pickClientLabel(selected)}
                          </div>
                          <div className="mt-1 text-xs text-white/55">
                            code: {selected.client_code} / created:{" "}
                            {formatDate(selected.created_at)}
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <span
                            className={clsx(
                              "rounded-full border px-3 py-1 text-xs font-semibold",
                              selected.is_active
                                ? "border-white/18 bg-white/12 text-white"
                                : "border-white/12 bg-white/8 text-white/75"
                            )}
                          >
                            {selected.is_active ? "有効" : "停止中"}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <div className="mb-2 text-xs text-white/60">
                          表示名（必須）
                        </div>
                        <input
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                        />
                      </div>

                      <div>
                        <div className="mb-2 text-xs text-white/60">
                          関係性（任意）
                        </div>
                        <input
                          value={editRel}
                          onChange={(e) => setEditRel(e.target.value)}
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                          placeholder="例：恋人 / 家族 / 友人"
                        />
                      </div>

                      <div className="md:col-span-2">
                        <div className="mb-2 text-xs text-white/60">
                          固定メモ（任意）
                        </div>
                        <textarea
                          value={editMemo}
                          onChange={(e) => setEditMemo(e.target.value)}
                          rows={5}
                          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                          placeholder="この人の固定プロフィール（変わりにくい要点）"
                        />
                      </div>
                    </div>
                  </div>

                  {/* 事情追記 */}
                  <div className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-6">
                    <div className="mb-4 rounded-2xl border border-white/10 bg-white/7 px-5 py-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-xs font-semibold tracking-[0.18em] text-white/55">
                            NOTES
                          </div>
                          <div className="mt-2 text-lg font-semibold text-white">
                            事情ログ（追記）
                          </div>
                          <div className="mt-1 text-sm text-white/55">
                            上書きせず積み上げる。削除は慎重に。
                          </div>
                        </div>
                        <div className="text-xs text-white/55">
                          {loadingNotes ? "読み込み中…" : `${notes.length} 件`}
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_auto]">
                      <textarea
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        rows={4}
                        placeholder="例：今日の出来事、相手の反応、前回との違い。短くてもOK。"
                        className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-7 text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                      />
                      <button
                        type="button"
                        onClick={addNote}
                        disabled={addingNote || !newNote.trim()}
                        className={clsx(
                          "rounded-2xl border px-6 py-4 text-sm font-semibold shadow-sm transition",
                          addingNote || !newNote.trim()
                            ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                            : "border-white/18 bg-white/14 text-white hover:bg-white/18"
                        )}
                      >
                        {addingNote ? "追加中…" : "追記"}
                      </button>
                    </div>

                    <div className="mt-4 max-h-[44vh] overflow-y-auto rounded-2xl border border-white/10 bg-white/5 p-3">
                      {notes.length === 0 ? (
                        <div className="p-3 text-sm text-white/55">
                          まだ追記事情がありません
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {notes.map((n) => (
                            <div
                              key={n.id}
                              className="rounded-2xl border border-white/10 bg-white/6 p-4 shadow-sm"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-xs text-white/55">
                                  {formatDate(n.created_at)}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => deleteNote(n.id)}
                                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-1.5 text-xs font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                                >
                                  削除
                                </button>
                              </div>
                              <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-white/90">
                                {n.note}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </section>
          </div>
        </div>

        {/* 画面下固定CTA（Welcomeの見た目に寄せる） */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span className={chip(!!selected)}>
                  {selected ? `選択中：${pickClientLabel(selected)}` : "カルテ未選択"}
                </span>
                <span className={chip(filterActive === "active")}>
                  {filterActive === "active" ? "有効のみ" : "全部"}
                </span>
                {!selected ? (
                  <span className="text-white/45">
                    ※左からカルテを選ぶと「保存/停止」が出ます
                  </span>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/welcome"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                  >
                    Welcome
                  </Link>
                  <Link
                    href="/read"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                  >
                    相談履歴
                  </Link>
                </div>

                {selected ? (
                  <div className="grid grid-cols-2 gap-2">
                    {selected.is_active ? (
                      <button
                        type="button"
                        onClick={() => setActive(false)}
                        className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                      >
                        停止
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setActive(true)}
                        className="rounded-2xl border border-white/18 bg-white/14 px-3 py-3 text-center text-xs font-semibold text-white shadow-sm transition hover:bg-white/18"
                      >
                        再開
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={saveProfile}
                      disabled={disableSave}
                      className={clsx(
                        "rounded-2xl border px-3 py-3 text-center text-xs font-semibold shadow-sm transition",
                        disableSave
                          ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                          : "border-white/18 bg-white/14 text-white hover:bg-white/18"
                      )}
                    >
                      保存
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowCreate(true)}
                    className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-center text-sm font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                  >
                    新規カルテ
                  </button>
                )}
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
          "radial-gradient(circle at 82% 86%, rgba(255,255,255,0.12) 0 1px, transparent 2px)",
        filter: "blur(0.2px)",
      }}
    />
  );
}