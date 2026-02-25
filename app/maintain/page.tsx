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
  return `C-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}-${d.getMilliseconds()}`;
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
  const selected = useMemo(() => clients.find((c) => c.id === selectedId) ?? null, [clients, selectedId]);

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

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
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
      .select("id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at")
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
      .select("id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at")
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
      .select("id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at")
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
      .select("id, owner_user_id, client_code, display_name, relationship_type, memo, is_active, created_at, updated_at, last_reading_at")
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
      router.push("/login?reason=signed_out");
    }
  }

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
          <header className="mb-8 md:mb-10">
            <div className="inline-flex flex-col gap-3">
              <h1
                className="text-4xl md:text-6xl tracking-tight text-slate-900"
                style={{ fontFamily: 'ui-serif, "Noto Serif JP", "Hiragino Mincho ProN", "Yu Mincho", serif' }}
              >
                Tarot Studio
              </h1>
              <p className="text-sm md:text-base text-slate-700">保守（顧客管理）</p>
              <div className="text-sm text-slate-600">
                {checkingAuth ? "ログイン確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
              </div>
            </div>
          </header>

          {toast ? (
            <div className="mb-4 rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm text-slate-800">
              {toast}
            </div>
          ) : null}

          {err ? (
            <div className="mb-4 rounded-2xl border border-red-200 bg-red-50/70 p-3 text-sm text-red-900">
              <div className="font-semibold">ERROR</div>
              <div className="mt-1">{err}</div>
            </div>
          ) : null}

          <section className="rounded-[28px] border border-white/40 bg-white/18 p-4 shadow-[0_30px_90px_rgba(15,23,42,0.25)] backdrop-blur-xl md:p-6">
            {/* 上部ナビ */}
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <span className="rounded-full border border-slate-200 bg-white px-3 py-1 text-xs font-semibold text-slate-700">
                  Maintain
                </span>
                <span className="text-sm text-slate-600">カルテを作る・直す・止める・事情を追記する</span>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Link
                  href="/welcome"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  Welcome
                </Link>
                <Link
                  href="/new"
                  className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm transition hover:bg-amber-100"
                >
                  鑑定（New）
                </Link>
                <Link
                  href="/read"
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
                >
                  履歴（Read）
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

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-4">
              {/* 左：一覧 */}
              <aside className="lg:col-span-1 space-y-4">
                <div className="rounded-2xl border border-white/50 bg-white/68 p-4 shadow-sm">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-semibold text-slate-900">顧客一覧</div>
                    <div className="text-xs text-slate-600">{loadingClients ? "読み込み中…" : `${clients.length} 件`}</div>
                  </div>

                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setFilterActive("active")}
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm",
                        filterActive === "active" ? "border-amber-200 bg-amber-50 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      有効のみ
                    </button>
                    <button
                      type="button"
                      onClick={() => setFilterActive("all")}
                      className={clsx(
                        "rounded-xl border px-3 py-2 text-xs font-semibold shadow-sm",
                        filterActive === "all" ? "border-amber-200 bg-amber-50 text-slate-900" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
                      )}
                    >
                      全部
                    </button>
                  </div>

                  <input
                    value={q}
                    onChange={(e) => setQ(e.target.value)}
                    placeholder="検索（名前/関係/メモ/コード）"
                    className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
                  />

                  <button
                    type="button"
                    onClick={() => setShowCreate((v) => !v)}
                    className="mt-3 w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                  >
                    ＋ 新規カルテ
                  </button>

                  {showCreate ? (
                    <div className="mt-3 rounded-2xl border border-slate-200 bg-white/80 p-3">
                      <div className="text-xs font-semibold text-slate-700">新規作成</div>

                      <div className="mt-2">
                        <div className="text-[11px] text-slate-600">表示名（必須）</div>
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none"
                          placeholder="例：Aさん"
                        />
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-slate-600">関係性（任意）</div>
                        <input
                          value={newRel}
                          onChange={(e) => setNewRel(e.target.value)}
                          className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm outline-none"
                          placeholder="例：友人 / 恋人 / 家族"
                        />
                      </div>

                      <div className="mt-2">
                        <div className="text-[11px] text-slate-600">メモ（任意）</div>
                        <textarea
                          value={newMemo}
                          onChange={(e) => setNewMemo(e.target.value)}
                          rows={3}
                          className="mt-1 w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-7 text-slate-900 shadow-sm outline-none"
                          placeholder="固定で残しておきたい要点"
                        />
                      </div>

                      <div className="mt-2 flex gap-2">
                        <button
                          type="button"
                          onClick={createClient}
                          disabled={creating || !newName.trim()}
                          className={clsx(
                            "flex-1 rounded-xl border px-3 py-2 text-sm font-semibold shadow-sm transition",
                            creating || !newName.trim()
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100"
                          )}
                        >
                          {creating ? "作成中…" : "作成"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setShowCreate(false)}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                        >
                          閉じる
                        </button>
                      </div>
                    </div>
                  ) : null}

                  <div className="mt-3 max-h-[52vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-2">
                    {filtered.length === 0 ? (
                      <div className="p-4 text-sm text-slate-600">該当なし</div>
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
                                active ? "border-amber-200 bg-amber-50" : "border-slate-200 bg-white hover:bg-slate-50"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <div className="text-sm font-semibold text-slate-900">{pickClientLabel(c)}</div>
                                {!c.is_active ? (
                                  <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                                    停止
                                  </span>
                                ) : null}
                              </div>
                              <div className="mt-1 text-[11px] text-slate-500">
                                code: {c.client_code}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              </aside>

              {/* 右：詳細 */}
              <section className="lg:col-span-3 space-y-4">
                {!selected ? (
                  <div className="rounded-2xl border border-white/50 bg-white/68 p-6 shadow-sm">
                    <div className="text-sm font-semibold text-slate-900">左からカルテを選んでください</div>
                    <div className="mt-2 text-xs text-slate-600">
                      ここで編集・停止・事情追記（時系列）をします。
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="rounded-2xl border border-white/50 bg-white/68 p-6 shadow-sm">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <div className="text-xs text-slate-600">選択中</div>
                          <div className="mt-1 text-2xl font-semibold text-slate-900">{pickClientLabel(selected)}</div>
                          <div className="mt-1 text-xs text-slate-500">
                            code: {selected.client_code} / created: {formatDate(selected.created_at)}
                          </div>
                        </div>

                        <div className="flex flex-wrap items-center gap-2">
                          {selected.is_active ? (
                            <button
                              type="button"
                              onClick={() => setActive(false)}
                              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                            >
                              停止（非表示）
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setActive(true)}
                              className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-amber-100"
                            >
                              再開（有効）
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={saveProfile}
                            className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2 text-sm font-semibold text-slate-900 shadow-sm hover:bg-amber-100"
                          >
                            保存
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div>
                          <div className="mb-2 text-xs text-slate-600">表示名（必須）</div>
                          <input
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
                          />
                        </div>

                        <div>
                          <div className="mb-2 text-xs text-slate-600">関係性（任意）</div>
                          <input
                            value={editRel}
                            onChange={(e) => setEditRel(e.target.value)}
                            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 shadow-sm outline-none"
                            placeholder="例：恋人 / 家族 / 友人"
                          />
                        </div>

                        <div className="sm:col-span-2">
                          <div className="mb-2 text-xs text-slate-600">固定メモ（任意）</div>
                          <textarea
                            value={editMemo}
                            onChange={(e) => setEditMemo(e.target.value)}
                            rows={5}
                            className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none"
                            placeholder="この人の固定プロフィール（変わりにくい要点）"
                          />
                        </div>
                      </div>
                    </div>

                    {/* 事情追記（時系列ログ） */}
                    <div className="rounded-2xl border border-white/50 bg-white/68 p-6 shadow-sm">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-slate-900">事情の追記（時系列）</div>
                          <div className="mt-1 text-xs text-slate-600">来るたびに増やす。上書きせず積み上げる。</div>
                        </div>
                        <div className="text-xs text-slate-600">
                          {loadingNotes ? "読み込み中…" : `${notes.length} 件`}
                        </div>
                      </div>

                      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto]">
                        <textarea
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          rows={4}
                          placeholder="例：今日は職場が変わった。相手との距離感が少し近づいた。前回より落ち着いて話せた。など"
                          className="w-full resize-none rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm leading-7 text-slate-900 shadow-sm outline-none placeholder:text-slate-400"
                        />
                        <button
                          type="button"
                          onClick={addNote}
                          disabled={addingNote || !newNote.trim()}
                          className={clsx(
                            "rounded-2xl border px-6 py-4 text-sm font-semibold shadow-sm transition",
                            addingNote || !newNote.trim()
                              ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                              : "border-amber-200 bg-amber-50 text-slate-900 hover:bg-amber-100"
                          )}
                        >
                          {addingNote ? "追加中…" : "追記"}
                        </button>
                      </div>

                      <div className="mt-4 max-h-[44vh] overflow-y-auto rounded-2xl border border-slate-200 bg-white/70 p-3">
                        {notes.length === 0 ? (
                          <div className="p-3 text-sm text-slate-600">まだ追記事情がありません</div>
                        ) : (
                          <div className="space-y-3">
                            {notes.map((n) => (
                              <div key={n.id} className="rounded-2xl border border-slate-200 bg-white/90 p-4 shadow-sm">
                                <div className="flex items-center justify-between gap-2">
                                  <div className="text-xs text-slate-500">{formatDate(n.created_at)}</div>
                                  <button
                                    type="button"
                                    onClick={() => deleteNote(n.id)}
                                    className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                                  >
                                    削除
                                  </button>
                                </div>
                                <div className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-slate-900">
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
          </section>

          <div className="h-10" />
        </div>
      </div>
    </main>
  );
}