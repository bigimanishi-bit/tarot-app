// app/welcome/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { getOrCreateDailyCards as getDailyCards } from "@/lib/dailyCards";
import AuditGeoFull from "./AuditGeoFull";
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
  birth_date: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  last_reading_at: string | null;
};

type UserProfileRow = {
  user_id: string;
  display_name: string | null;
  birth_date: string | null;
  updated_at: string | null;
};

type WeatherView = {
  locationLabel: string;
  currentTempC: number | null;
  todayMaxC: number | null;
  todayMinC: number | null;
  weatherLabel: string | null;
};

type DrawMode = "self" | "ai";

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
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

function weatherEmoji(label: string | null | undefined) {
  const s = (label ?? "").toLowerCase();
  if (!s) return "🌤️";
  if (s.includes("雷")) return "⛈️";
  if (s.includes("雪")) return "❄️";
  if (s.includes("霧")) return "🌫️";
  if (s.includes("雨")) return "🌧️";
  if (s.includes("快晴")) return "☀️";
  if (s.includes("晴")) return "🌤️";
  if (s.includes("曇")) return "☁️";
  return "🌤️";
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

// ---- Moon ----
function moonAgeDaysJST(now = new Date()): number {
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
function moonPct(age: number) {
  const syn = 29.530588;
  const t = age / syn;
  if (t <= 0.5) return Math.round((t / 0.5) * 100);
  return Math.round((1 - (t - 0.5) / 0.5) * 100);
}

// ---- Cards ----
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
function dailyThemeText(names: string[]): string {
  const cards = (names ?? []).slice(0, 3).map((x) => (x ?? "").toLowerCase());
  const s = cards.join(" / ");
  if (s.includes("tower")) return "今日は「揺れ」を通して真実が出る日。";
  if (s.includes("moon")) return "今日は「不安の増幅」に注意。事実で足場を作る日。";
  if (s.includes("sun")) return "今日は「回復」と「光」。小さく前に進める日。";
  if (s.includes("death")) return "今日は「切り替え」。終わらせて次へ進む日。";
  if (s.includes("wheel")) return "今日は「流れが動く」。固執せず波に乗る日。";
  if (s.includes("swords")) return "今日は「言葉と頭」。整理すれば強い日。";
  if (s.includes("cups")) return "今日は「気持ち」。やさしく整える日。";
  if (s.includes("wands")) return "今日は「火」。小さく着火する日。";
  if (s.includes("pentacles")) return "今日は「現実」。足元を固める日。";
  return "今日は「空気が動く」。静かに整える日。";
}

function loadDrawMode(): DrawMode | null {
  try {
    const v = localStorage.getItem("ts_draw_mode");
    return v === "self" || v === "ai" ? v : null;
  } catch {
    return null;
  }
}
function saveDrawMode(m: DrawMode) {
  try {
    localStorage.setItem("ts_draw_mode", m);
  } catch {}
}

export default function WelcomePage() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);
  const [profiles, setProfiles] = useState<ClientProfileRow[]>([]);
  const [q, setQ] = useState("");

  const [dailyCards, setDailyCards] = useState<string[] | null>(null);

  const [weather, setWeather] = useState<WeatherView | null>(null);
  const [weatherErr, setWeatherErr] = useState<string | null>(null);

  const [moonAge, setMoonAge] = useState<number>(() => moonAgeDaysJST(new Date()));
  const mp = moonPct(moonAge);

  const [drawMode, setDrawMode] = useState<DrawMode | null>(null);

  // UI: 相談者カルテ一覧は必要なときだけ開く
  const [openProfiles, setOpenProfiles] = useState(false);

  // ✅ 生年月日（自分 / 相談者）
  const [selfBirth, setSelfBirth] = useState<string>("");
  const [selfBirthSaving, setSelfBirthSaving] = useState(false);
  const [selfBirthMsg, setSelfBirthMsg] = useState<string | null>(null);

  const [clientBirth, setClientBirth] = useState<string>("");
  const [clientBirthSaving, setClientBirthSaving] = useState(false);
  const [clientBirthMsg, setClientBirthMsg] = useState<string | null>(null);

  useEffect(() => {
    const t = setInterval(() => setMoonAge(moonAgeDaysJST(new Date())), 60_000);
    return () => clearInterval(t);
  }, []);

  // auth + allowlist + profiles + daily + user_profile
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setChecking(true);
      setErr(null);

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

      const uid = session.user.id;
      setUserId(uid);

      const email = session.user.email ?? null;
      setUserEmail(email);

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

      // scope
      const s = loadScope();
      setScope(s);

      // drawMode
      const dm = loadDrawMode();
      setDrawMode(dm);

      // daily cards
      try {
        const daily = getDailyCards(uid);
        setDailyCards(daily.cards);
      } catch {
        setDailyCards(null);
      }

      // profiles
      const { data: rows, error: profErr } = await supabase
        .from("client_profiles")
        .select("id, display_name, relationship_type, memo, birth_date, is_active, created_at, updated_at, last_reading_at")
        .order("updated_at", { ascending: false });

      if (profErr) setErr(`client_profiles 読み込みエラー: ${profErr.message}`);
      else setProfiles((rows ?? []) as ClientProfileRow[]);

      // ✅ user_profile（自分の生年月日）
      const { data: up, error: upErr } = await supabase
        .from("user_profile")
        .select("user_id, display_name, birth_date, updated_at")
        .eq("user_id", uid)
        .maybeSingle();

      if (!upErr) {
        const row = (up ?? null) as UserProfileRow | null;
        setSelfBirth(row?.birth_date ?? "");
      }

      setChecking(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // weather
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

        let lat = 35.681236;
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

  // ✅ scopeがclientになったら、その相談者のbirth_dateを入力欄へ反映
  useEffect(() => {
    if (!scope) return;
    if (scope.targetType !== "client") {
      setClientBirth("");
      setClientBirthMsg(null);
      return;
    }
    const pid = scope.clientProfileId;
    if (!pid) return;
    const p = profiles.find((x) => x.id === pid);
    setClientBirth(p?.birth_date ?? "");
    setClientBirthMsg(null);
  }, [scope, profiles]);

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

  const readyScope = isScopeReady(scope);
  const ready = !!drawMode && readyScope;

  function pickDrawMode(m: DrawMode) {
    saveDrawMode(m);
    setDrawMode(m);
  }

  function chooseSelf() {
    const next: TarotScope = {
      targetType: "self",
      clientProfileId: null,
      clientDisplayName: null,
      updatedAt: Date.now(),
    };
    saveScope(next);
    setScope(next);
    setOpenProfiles(false);
    setClientBirth("");
    setClientBirthMsg(null);
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
    setOpenProfiles(false);
    setClientBirth(p.birth_date ?? "");
    setClientBirthMsg(null);
  }

  function resetAll() {
    clearScope();
    setScope(null);
    try {
      localStorage.removeItem("ts_draw_mode");
    } catch {}
    setDrawMode(null);
    setOpenProfiles(false);
    setSelfBirthMsg(null);
    setClientBirthMsg(null);
  }

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  async function saveSelfBirthDate() {
    if (!userId) return;
    setSelfBirthSaving(true);
    setSelfBirthMsg(null);
    try {
      const birth = selfBirth ? selfBirth : null;
      const { error } = await supabase
        .from("user_profile")
        .upsert(
          {
            user_id: userId,
            birth_date: birth,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "user_id" }
        );

      if (error) throw error;
      setSelfBirthMsg("保存しました");
    } catch (e: any) {
      setSelfBirthMsg(e?.message ?? "保存に失敗しました");
    } finally {
      setSelfBirthSaving(false);
    }
  }

  async function saveClientBirthDate() {
    if (!scope || scope.targetType !== "client" || !scope.clientProfileId) return;
    setClientBirthSaving(true);
    setClientBirthMsg(null);
    try {
      const birth = clientBirth ? clientBirth : null;
      const { error } = await supabase
        .from("client_profiles")
        .update({ birth_date: birth })
        .eq("id", scope.clientProfileId);

      if (error) throw error;

      // ローカルのprofilesも更新（見た目の反映用）
      setProfiles((prev) =>
        prev.map((p) =>
          p.id === scope.clientProfileId ? { ...p, birth_date: birth } : p
        )
      );

      setClientBirthMsg("保存しました");
    } catch (e: any) {
      setClientBirthMsg(e?.message ?? "保存に失敗しました");
    } finally {
      setClientBirthSaving(false);
    }
  }

  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/6 text-white/60"
    );

  const choiceBtn = (active?: boolean) =>
    clsx(
      "w-full rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
      active
        ? "border-white/25 bg-white/16 text-white"
        : "border-white/12 bg-white/8 text-white/85 hover:bg-white/12"
    );

  // 固定CTA
  const primaryHref = drawMode === "ai" ? "/quick" : "/new";
  const primaryLabel = drawMode === "ai" ? "AIが引いて占う" : "鑑定する";

  // 左の天気表示
  const WeatherLine = () => {
    if (weatherErr) return <div className="text-sm text-white/60">天気取得失敗</div>;
    if (!weather) return <div className="text-sm text-white/60">天気取得中…</div>;
    return (
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="text-2xl">{weatherEmoji(weather.weatherLabel)}</div>
          <div>
            <div className="text-sm font-semibold text-white/90">
              {weather.locationLabel} / {weather.weatherLabel ?? "—"}
            </div>
            <div className="text-xs text-white/60">
              いま {weather.currentTempC != null ? `${Math.round(weather.currentTempC)}℃` : "—"} ／
              最高 {weather.todayMaxC != null ? `${Math.round(weather.todayMaxC)}℃` : "—"} ／
              最低 {weather.todayMinC != null ? `${Math.round(weather.todayMinC)}℃` : "—"}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <main className="min-h-screen">
      <AuditGeoFull userId={userId} />

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

        {/* header */}
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
                  {checking ? "確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
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
          {err ? (
            <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              {err}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[420px_1fr] md:gap-6">
            {/* LEFT */}
            <aside className="md:sticky md:top-[84px] self-start">
              <div className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl">
                <div className="rounded-[22px] border border-white/10 bg-white/7 p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/60">TODAY</div>
                  <div className="mt-1 text-base font-semibold text-white/90">今日の3枚</div>

                  {!dailyCards ? (
                    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/65">
                      （まだありません）
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 grid grid-cols-3 gap-3">
                        {dailyCards.slice(0, 3).map((name, i) => (
                          <div key={i} className="rounded-2xl border border-white/10 bg-black/20 p-2">
                            <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 py-2">
                              <img
                                src={cardImageSrc(name)}
                                alt={name}
                                className="h-[96px] w-[70px] object-contain"
                                onError={(e) => {
                                  (e.currentTarget as HTMLImageElement).style.display = "none";
                                }}
                              />
                            </div>
                            <div className="mt-2 text-[10px] text-white/70 line-clamp-1">{name}</div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm leading-6 text-white/80">
                        {dailyThemeText(dailyCards)}
                      </div>
                    </>
                  )}

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">WEATHER</div>
                    <div className="mt-2">
                      <WeatherLine />
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">MOON</div>
                    <div className="mt-2 flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="text-3xl">{moonEmoji(moonAge)}</div>
                        <div>
                          <div className="text-sm font-semibold text-white/90">{moonPhaseLabel(moonAge)}</div>
                          <div className="text-xs text-white/60">
                            月齢 {moonAge.toFixed(1)}日 ／ 満ち具合 {mp}%
                          </div>
                        </div>
                      </div>
                      <div className="text-xs text-white/60">
                        {mp >= 70 ? "" : mp <= 30 ? "減らす" : "整える"}
                      </div>
                    </div>

                    <div className="mt-3 h-2 w-full rounded-full border border-white/10 bg-white/5">
                      <div className="h-2 rounded-full bg-white/30" style={{ width: `${mp}%` }} />
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* RIGHT */}
            <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-6">
              <div className="mb-4 rounded-2xl border border-white/10 bg-white/7 px-5 py-4">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">WELCOME</div>
                <div className="mt-2 text-xl font-semibold text-white">ここで、整えてから占う。</div>
                <div className="mt-1 text-sm text-white/55">迷ってるままでも大丈夫。まずは入口だけ決めよう。</div>
              </div>

              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={chip(!!drawMode)}>
                    カード：{drawMode === "self" ? "自分で引く" : drawMode === "ai" ? "AIが引く" : "未選択"}
                  </span>
                  <span className={chip(readyScope)}>
                    入れ物：{readyScope ? scopeLabel(scope) : "未選択"}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={resetAll}
                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                >
                  リセット
                </button>
              </div>

              {/* STEP 1 */}
              <div className="rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">STEP 1</div>
                <div className="mt-2 text-lg font-semibold text-white">カードを用意する？</div>
                <div className="mt-1 text-sm text-white/55">手元にあるなら「自分で引く」。ないなら「AIが引く」。</div>

                <div className="mt-4 grid gap-3">
                  <button type="button" onClick={() => pickDrawMode("self")} className={choiceBtn(drawMode === "self")}>
                    自分で引く（カードあり）
                  </button>
                  <button type="button" onClick={() => pickDrawMode("ai")} className={choiceBtn(drawMode === "ai")}>
                    AIが引く（カードなし）
                  </button>
                </div>
              </div>

              {/* STEP 2 */}
              <div className="mt-4 rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">STEP 2</div>
                    <div className="mt-2 text-lg font-semibold text-white">誰を占う？</div>
                    <div className="mt-1 text-sm text-white/55">あなた / 相談者　混ざりません。</div>
                  </div>

                  <Link
                    href="/maintain"
                    className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    相談者カルテ編集
                  </Link>
                </div>

                <div className="mt-4 grid gap-3">
                  <button type="button" onClick={chooseSelf} className={choiceBtn(scope?.targetType === "self")}>
                    あなた（セルフ）
                  </button>

                  <button
                    type="button"
                    onClick={() => setOpenProfiles((v) => !v)}
                    className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3 text-sm font-semibold text-white/85 hover:bg-white/12"
                    disabled={!drawMode}
                  >
                    {openProfiles ? "相談者カルテ一覧を閉じる" : "相談者カルテから選ぶ"}
                  </button>

                  {openProfiles ? (
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                      <div className="mt-1 text-xs text-white/55">選んだら自動で閉じます</div>

                      <div className="mt-3">
                        <input
                          value={q}
                          onChange={(e) => setQ(e.target.value)}
                          placeholder="検索（名前 / 関係 / メモ）"
                          className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                        />
                      </div>

                      <div className="mt-3 max-h-[360px] overflow-auto rounded-2xl border border-white/10">
                        {checking ? (
                          <div className="px-4 py-4 text-sm text-white/55">読み込み中…</div>
                        ) : filtered.length === 0 ? (
                          <div className="px-4 py-4 text-sm text-white/55">まだ相談者カルテがありません。</div>
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
                                        ? "border-white/25 bg-white/16 text-white"
                                        : "border-white/10 bg-white/6 text-white/85 hover:bg-white/10"
                                    )}
                                  >
                                    <div className="flex items-center justify-between gap-3">
                                      <div className="text-sm font-semibold">{p.display_name}</div>
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
                    </div>
                  ) : null}

                  {/* ✅ 生年月日（選択に応じて表示） */}
                  <div className="mt-2 rounded-2xl border border-white/10 bg-white/6 p-4">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">BIRTH DATE</div>

                    {scope?.targetType === "self" ? (
                      <>
                        <div className="mt-2 text-sm font-semibold text-white">あなたの生年月日</div>
                        <div className="mt-1 text-xs text-white/55">任意。次回の入力を省けます。</div>

                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                          <input
                            type="date"
                            value={selfBirth}
                            onChange={(e) => setSelfBirth(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none focus:border-white/20"
                          />
                          <button
                            type="button"
                            onClick={saveSelfBirthDate}
                            disabled={selfBirthSaving || !userId}
                            className={clsx(
                              "rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                              selfBirthSaving || !userId
                                ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                                : "border-white/12 bg-white/8 text-white/85 hover:bg-white/12"
                            )}
                          >
                            {selfBirthSaving ? "保存中…" : "保存"}
                          </button>
                        </div>

                        {selfBirthMsg ? (
                          <div className="mt-2 text-xs text-white/60">{selfBirthMsg}</div>
                        ) : null}
                      </>
                    ) : scope?.targetType === "client" ? (
                      <>
                        <div className="mt-2 text-sm font-semibold text-white">
                          相談者の生年月日{scope.clientDisplayName ? `（${scope.clientDisplayName}）` : ""}
                        </div>
                        <div className="mt-1 text-xs text-white/55">任意。次回の入力を省けます。</div>

                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto] md:items-center">
                          <input
                            type="date"
                            value={clientBirth}
                            onChange={(e) => setClientBirth(e.target.value)}
                            className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none focus:border-white/20"
                          />
                          <button
                            type="button"
                            onClick={saveClientBirthDate}
                            disabled={clientBirthSaving || !scope.clientProfileId}
                            className={clsx(
                              "rounded-2xl border px-4 py-3 text-sm font-semibold shadow-sm transition",
                              clientBirthSaving || !scope.clientProfileId
                                ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                                : "border-white/12 bg-white/8 text-white/85 hover:bg-white/12"
                            )}
                          >
                            {clientBirthSaving ? "保存中…" : "保存"}
                          </button>
                        </div>

                        {clientBirthMsg ? (
                          <div className="mt-2 text-xs text-white/60">{clientBirthMsg}</div>
                        ) : null}
                      </>
                    ) : (
                      <div className="mt-2 text-sm text-white/55">
                        「あなた」か「相談者」を選ぶと、生年月日を登録できます。
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="mt-5 text-xs text-white/55">private beta</div>
            </section>
          </div>

          {/* 画面下固定CTA */}
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
            <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                  <span className={chip(!!drawMode)}>
                    {drawMode === "self" ? "自分で引く" : drawMode === "ai" ? "AIが引く" : "カード未選択"}
                  </span>
                  <span className={chip(readyScope)}>
                    {readyScope ? scopeLabel(scope) : "引き出し未選択"}
                  </span>
                  {!ready ? (
                    <span className="text-white/45">※「カード」と「引き出し」を選ぶと押せます</span>
                  ) : null}
                </div>

                <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                  <Link
                    href={primaryHref}
                    aria-disabled={!ready}
                    onClick={(e) => {
                      if (!ready) e.preventDefault();
                    }}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm transition",
                      ready
                        ? "border-white/18 bg-white/14 text-white hover:bg-white/18"
                        : "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                    )}
                  >
                    {primaryLabel}
                  </Link>

                  <div className="grid grid-cols-2 gap-2">
                    {/* ✅ 相談履歴はいつでも押せる */}
                    <Link
                      href="/read"
                      className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 shadow-sm transition hover:bg-white/12"
                    >
                      相談履歴
                    </Link>

                    <Link
                      href="/chat"
                      aria-disabled={!readyScope}
                      onClick={(e) => {
                        if (!readyScope) e.preventDefault();
                      }}
                      className={clsx(
                        "rounded-2xl border px-3 py-3 text-center text-xs font-semibold shadow-sm transition",
                        readyScope
                          ? "border-white/12 bg-white/8 text-white/85 hover:bg-white/12"
                          : "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                      )}
                    >
                      AI対話相談へ
                    </Link>
                  </div>
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
          "radial-gradient(circle at 82% 86%, rgba(255,255,255,0.12) 0 1px, transparent 2px)",
        filter: "blur(0.2px)",
      }}
    />
  );
}