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

type ChatScopeLabel = string;

type WeatherView = {
  locationLabel: string;
  currentTempC: number | null;
  todayMaxC: number | null;
  todayMinC: number | null;
  weatherLabel: string | null;
};

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

function weatherCodeLabel(code: number | null | undefined): string | null {
  if (code == null) return null;
  if (code === 0) return "快晴";
  if (code === 1) return "晴れ";
  if (code === 2) return "薄曇り";
  if (code === 3) return "曇り";
  if (code === 45 || code === 48) return "霧";
  if (code === 51 || code === 53 || code === 55) return "霧雨";
  if (code === 56 || code === 57) return "凍雨";
  if (code === 61 || code === 63 || code === 65) return "雨";
  if (code === 66 || code === 67) return "強い雨";
  if (code === 71 || code === 73 || code === 75) return "雪";
  if (code === 77) return "雪（細かい）";
  if (code === 80 || code === 81 || code === 82) return "にわか雨";
  if (code === 85 || code === 86) return "にわか雪";
  if (code === 95) return "雷雨";
  if (code === 96 || code === 99) return "雷雨（ひょう）";
  return "天気";
}

async function fetchWeather(lat: number, lon: number): Promise<WeatherView> {
  const url =
    "https://api.open-meteo.com/v1/forecast" +
    `?latitude=${encodeURIComponent(lat)}` +
    `&longitude=${encodeURIComponent(lon)}` +
    `&current=temperature_2m,weather_code` +
    `&daily=temperature_2m_max,temperature_2m_min,weather_code` +
    `&timezone=${encodeURIComponent("Asia/Tokyo")}`;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`weather ${res.status}`);
  const j = await res.json();

  const curTemp =
    typeof j?.current?.temperature_2m === "number" ? j.current.temperature_2m : null;
  const curCode =
    typeof j?.current?.weather_code === "number" ? j.current.weather_code : null;

  const max0 =
    Array.isArray(j?.daily?.temperature_2m_max) &&
    typeof j.daily.temperature_2m_max[0] === "number"
      ? j.daily.temperature_2m_max[0]
      : null;

  const min0 =
    Array.isArray(j?.daily?.temperature_2m_min) &&
    typeof j.daily.temperature_2m_min[0] === "number"
      ? j.daily.temperature_2m_min[0]
      : null;

  const dCode0 =
    Array.isArray(j?.daily?.weather_code) &&
    typeof j.daily.weather_code[0] === "number"
      ? j.daily.weather_code[0]
      : null;

  return {
    locationLabel: "現在地",
    currentTempC: curTemp,
    todayMaxC: max0,
    todayMinC: min0,
    weatherLabel: weatherCodeLabel(curCode ?? dCode0),
  };
}

// ---- Moon age (simple) ----
function moonAgeDaysJST(now = new Date()): number {
  // 2024-01-11 20:57 JST (= UTC 11:57)
  const base = new Date("2024-01-11T11:57:00.000Z");
  const synodic = 29.530588;
  const diffDays = (now.getTime() - base.getTime()) / 86400000;
  let age = diffDays % synodic;
  if (age < 0) age += synodic;
  return age;
}
function moonPhaseLabel(age: number): string {
  if (age < 1.5) return "新月";
  if (age < 7.4) return "上弦へ";
  if (age < 8.9) return "上弦";
  if (age < 14.8) return "満月へ";
  if (age < 16.2) return "満月";
  if (age < 22.1) return "下弦へ";
  if (age < 23.6) return "下弦";
  return "新月へ";
}
function moonEmoji(age: number): string {
  const syn = 29.530588;
  const t = age / syn;
  if (t < 0.125) return "🌑";
  if (t < 0.25) return "🌒";
  if (t < 0.375) return "🌓";
  if (t < 0.5) return "🌔";
  if (t < 0.625) return "🌕";
  if (t < 0.75) return "🌖";
  if (t < 0.875) return "🌗";
  return "🌘";
}

// ---- Card image helper ----
// 画像がある場合：public/cards/rws/<slug>.jpg で表示される（無ければ自動で消えてテキストだけ残る）
function slugifyCardName(name: string): string {
  return name
    .toLowerCase()
    .replace(/’/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
function cardImageSrc(name: string): string {
  return `/cards/rws/${slugifyCardName(name)}.jpg`;
}

export default function WelcomePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);
  const [profiles, setProfiles] = useState<ClientProfileRow[]>([]);
  const [q, setQ] = useState("");

  const [nextPath, setNextPath] = useState<string | null>(null);

  const [dailyCards, setDailyCards] = useState<string[] | null>(null);

  const [weather, setWeather] = useState<WeatherView | null>(null);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);

  const [moonAge, setMoonAge] = useState<number>(() => moonAgeDaysJST(new Date()));

  const [newName, setNewName] = useState("");
  const [newRel, setNewRel] = useState("");
  const [newMemo, setNewMemo] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setMoonAge(moonAgeDaysJST(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setChecking(true);
      setErr(null);

      try {
        const qs = new URLSearchParams(window.location.search);
        setNextPath(qs.get("next"));
      } catch {
        setNextPath(null);
      }

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

      try {
        const uid = session.user.id;
        const daily = getDailyCards(uid);
        setDailyCards(daily.cards);
      } catch {
        setDailyCards(null);
      }

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

      const s = loadScope();
      setScope(s);

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

  // 天気（現在地 or 東京）
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setWeatherErr(null);
      try {
        const getPos = () =>
          new Promise<GeolocationPosition>((resolve, reject) => {
            if (!navigator.geolocation) return reject(new Error("no geolocation"));
            navigator.geolocation.getCurrentPosition(resolve, reject, {
              enableHighAccuracy: false,
              timeout: 6000,
              maximumAge: 10 * 60 * 1000,
            });
          });

        let lat = 35.681236; // Tokyo fallback
        let lon = 139.767125;

        try {
          const pos = await getPos();
          lat = pos.coords.latitude;
          lon = pos.coords.longitude;
        } catch {}

        const w = await fetchWeather(lat, lon);
        if (cancelled) return;

        if (Math.abs(lat - 35.681236) < 0.01 && Math.abs(lon - 139.767125) < 0.01) {
          w.locationLabel = "東京";
        }

        setWeather(w);
      } catch (e: any) {
        if (cancelled) return;
        setWeather(null);
        setWeatherErr(e?.message ?? "weather error");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

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

      chooseClient(row);
    } catch (e: any) {
      setErr(e?.message ?? "作成に失敗しました");
    } finally {
      setCreating(false);
    }
  }

  // 黒文字を潰す：importantで白固定
  const primaryBtn = (enabled: boolean) =>
    clsx(
      "w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition !text-white",
      enabled
        ? "border-white/15 bg-white/10 hover:bg-white/14 !text-white"
        : "cursor-not-allowed border-white/8 bg-white/5 !text-white/60"
    );

  return (
    <main className="min-h-screen">
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

        {/* sticky header */}
        <div className="sticky top-0 z-40 border-b border-white/10 bg-[#0B1020]/55 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
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

                {/* ✅ 天気：Tarot Studioの横 */}
                <div className="hidden items-center gap-2 rounded-full border border-white/12 bg-white/8 px-3 py-1 text-xs font-semibold !text-white/85 md:inline-flex">
                  <span className="text-white/60">天気</span>
                  {weatherErr ? (
                    <span className="text-white/55">–</span>
                  ) : !weather ? (
                    <span className="text-white/55">取得中…</span>
                  ) : (
                    <span className="text-white/85">
                      {weather.weatherLabel ?? "—"}
                      {weather.currentTempC != null ? ` / ${Math.round(weather.currentTempC)}℃` : ""}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <span className="hidden text-xs text-white/55 md:inline">
                  {checking ? "確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
                </span>
                <button
                  onClick={logout}
                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold !text-white/85 hover:bg-white/12"
                >
                  ログアウト
                </button>
              </div>
            </div>
          </div>
        </div>

        <div className="relative mx-auto max-w-6xl px-4 py-8 md:px-6 md:py-12">
          {/* hero: 左タイトル + 右（今日の3枚） */}
          <header className="mb-6 grid gap-4 md:mb-10 md:grid-cols-[1fr_420px] md:items-start md:gap-6">
            <div>
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
            </div>

            {/* ✅ 今日の3枚：そのまま（右上） */}
            <div className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_90px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
              <div className="rounded-2xl border border-white/10 bg-white/7 p-4 text-white">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/60">
                  TODAY CARDS
                </div>
                <div className="mt-2 text-sm font-semibold text-white/90">今日の3枚</div>

                {!dailyCards ? (
                  <div className="mt-2 text-sm text-white/60">（まだありません）</div>
                ) : (
                  <>
                    <div className="mt-3 grid grid-cols-3 gap-2">
                      {dailyCards.slice(0, 3).map((name, i) => (
                        <div key={i} className="rounded-xl border border-white/10 bg-black/20 p-1">
                          <img
                            src={cardImageSrc(name)}
                            alt={name}
                            className="h-[98px] w-full rounded-lg object-cover"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                          <div className="mt-1 text-[11px] leading-4 text-white/75">
                            {i + 1}: {name}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 text-[11px] text-white/45">
                      ※画像は /public/cards/rws/ に配置すると表示されます
                    </div>
                  </>
                )}
              </div>
            </div>
          </header>

          {/* エラー */}
          {err ? (
            <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              {err}
            </div>
          ) : null}

          {/* メイン */}
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
                    className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold !text-white/85 hover:bg-white/12"
                    type="button"
                  >
                    選択を消す
                  </button>
                </div>

                <div className="grid gap-3">
                  <button onClick={chooseSelf} className={primaryBtn(true)} type="button">
                    自分をみる（セルフ鑑定）
                  </button>

                  <Link href="/maintain" className={primaryBtn(true)}>
                    カルテ編集（Maintain）
                  </Link>

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
                        className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm !text-white shadow-sm outline-none placeholder:!text-white/35 focus:border-white/20"
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
                                    "w-full rounded-2xl border px-4 py-3 text-left transition !text-white",
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

                    <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="text-sm font-semibold text-white/85">新規登録（カルテ）</div>

                      <div className="mt-3 grid gap-3">
                        <input
                          value={newName}
                          onChange={(e) => setNewName(e.target.value)}
                          placeholder="表示名（例：Aさん）"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm !text-white shadow-sm outline-none placeholder:!text-white/35 focus:border-white/20"
                        />
                        <input
                          value={newRel}
                          onChange={(e) => setNewRel(e.target.value)}
                          placeholder="関係（任意：恋人/家族/同僚など）"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm !text-white shadow-sm outline-none placeholder:!text-white/35 focus:border-white/20"
                        />
                        <textarea
                          value={newMemo}
                          onChange={(e) => setNewMemo(e.target.value)}
                          rows={3}
                          placeholder="事情メモ（任意：あとから追記して育てる）"
                          className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm !text-white shadow-sm outline-none placeholder:!text-white/35 focus:border-white/20"
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

              {/* 右：行き先 */}
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5 shadow-sm md:p-6">
                <div className="mb-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/60">
                    START
                  </div>
                  <div className="mt-2 text-2xl font-semibold text-white">次にすること</div>
                  <p className="mt-2 text-sm text-white/65">
                    Newで鑑定結果まで出ます。補足がある時だけChatへ。
                    <br />
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
                    一時鑑定（Newで完結）
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
                    補足質問（Chat）
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

                <div className="mt-6 flex items-center justify-between text-xs text-white/45">
                  <span>Tarot Studio / private beta</span>
                  <span>静かに、深く。</span>
                </div>
              </div>
            </div>
          </section>

          <div className="h-10" />
        </div>

        {/* ✅ 月齢：右下固定 */}
        <div className="fixed bottom-4 right-4 z-40 w-[220px] rounded-2xl border border-white/12 bg-white/6 p-4 text-white shadow-[0_25px_80px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
          <div className="text-xs font-semibold tracking-[0.18em] text-white/60">MOON</div>
          <div className="mt-2 flex items-center justify-between">
            <div className="text-sm font-semibold text-white/90">月齢</div>
            <div className="text-xs text-white/60">
              {moonEmoji(moonAge)} {moonPhaseLabel(moonAge)}
            </div>
          </div>
          <div className="mt-2 text-sm text-white/85">月齢 {moonAge.toFixed(1)} 日</div>
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