// app/new/page.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadScope, isScopeReady, scopeLabel, type TarotScope } from "@/lib/scope";

type ToneKey = "warm" | "neutral" | "direct";
type LengthPreset = "short" | "normal" | "deep";
type SpreadKey =
  | "one_card"
  | "two_choices"
  | "past_present_future"
  | "four_situation"
  | "five_cross"
  | "five_feelings"
  | "six_relationship"
  | "seven_horseshoe"
  | "eight_workflow"
  | "nine_box"
  | "celtic_10"
  | "twelve_months"
  | "thirteen_full";

type DeckRow = { key: string; name: string | null };
type SpreadDef = { key: SpreadKey; label: string };

const SPREADS: SpreadDef[] = [
  { key: "one_card", label: "1枚（シンプル）" },
  { key: "two_choices", label: "2枚（A/B）" },
  { key: "past_present_future", label: "3枚（過去/現在/未来）" },
  { key: "four_situation", label: "4枚（状況/障害/対策/結果）" },
  { key: "five_cross", label: "5枚（クロス）" },
  { key: "five_feelings", label: "5枚（気持ち）" },
  { key: "six_relationship", label: "6枚（関係）" },
  { key: "seven_horseshoe", label: "7枚（ホースシュー）" },
  { key: "eight_workflow", label: "8枚（手順）" },
  { key: "nine_box", label: "9枚（ボックス）" },
  { key: "celtic_10", label: "10枚（ケルト十字）" },
  { key: "twelve_months", label: "12枚（12ヶ月）" },
  { key: "thirteen_full", label: "13枚（フル）" },
];

const PRESETS = [
  {
    key: "love_5",
    title: "恋愛：相手の気持ち（5枚）",
    desc: "現状/相手/本音/障害/打開",
    spread: "five_feelings" as SpreadKey,
    tone: "direct" as ToneKey,
    text:
      "【恋愛】相手の気持ち（5枚）\n" +
      "状況（短く）：\n\n" +
      "現状：\n" +
      "相手（または環境）：\n" +
      "本音：\n" +
      "障害：\n" +
      "打開：\n\n" +
      "補足（あれば）：",
  },
  {
    key: "work_3",
    title: "仕事：現状/課題/アドバイス（3枚）",
    desc: "短く、要点で",
    spread: "past_present_future" as SpreadKey,
    tone: "neutral" as ToneKey,
    text:
      "【仕事】現状/課題/アドバイス（3枚）\n\n" +
      "状況（短く）：\n\n" +
      "現状：\n" +
      "課題：\n" +
      "助言：\n\n" +
      "補足（あれば）：",
  },
  {
    key: "simple_1",
    title: "1枚：今必要なメッセージ",
    desc: "サクッと",
    spread: "one_card" as SpreadKey,
    tone: "direct" as ToneKey,
    text:
      "【1枚】今必要なメッセージ\n\n" +
      "状況（短く）：\n\n" +
      "助言：\n\n" +
      "補足（あれば）：",
  },
];

type GenerateOk = {
  ok: true;
  text: string;
  prompt_updated_at?: string | null;
  reading_id?: string | null;
};
type GenerateNg = { ok: false; message?: string };
type GenerateResp = GenerateOk | GenerateNg;

// ---- Weather (client) ----
type WeatherPayload = {
  locationLabel: string;
  currentTempC: number | null;
  todayMaxC: number | null;
  todayMinC: number | null;
  weatherLabel: string | null;
};

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

async function fetchWeather(lat: number, lon: number): Promise<WeatherPayload> {
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

// ---- Moon (client) ----
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
function moonPct(age: number) {
  const syn = 29.530588;
  const t = age / syn;
  if (t <= 0.5) return Math.round((t / 0.5) * 100);
  return Math.round((1 - (t - 0.5) / 0.5) * 100);
}

function clsx(...xs: Array<string | false | null | undefined>) {
  return xs.filter(Boolean).join(" ");
}

function lengthLabel(p: LengthPreset) {
  if (p === "short") return "短め";
  if (p === "deep") return "深掘り";
  return "ふつう";
}

export default function NewPage() {
  const router = useRouter();

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [decks, setDecks] = useState<DeckRow[]>([]);
  const [deckKey, setDeckKey] = useState("rws");
  const [spread, setSpread] = useState<SpreadKey>("five_feelings");
  const [tone, setTone] = useState<ToneKey>("direct");

  // ✅ 追加：文字数プリセット
  const [lengthPreset, setLengthPreset] = useState<LengthPreset>("normal");

  const [presetKey, setPresetKey] = useState(PRESETS[0].key);
  const preset = useMemo(
    () => PRESETS.find((p) => p.key === presetKey) ?? PRESETS[0],
    [presetKey]
  );

  const [draft, setDraft] = useState(preset.text);
  const [err, setErr] = useState<string | null>(null);

  const [generating, setGenerating] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  // 材料
  const [userBirthDate, setUserBirthDate] = useState<string | null>(null);
  const [clientBirthDate, setClientBirthDate] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [moon, setMoon] = useState<{ ageDays: number; phaseLabel: string; pct: number } | null>(
    null
  );

  const spreadLabel = useMemo(
    () => SPREADS.find((s) => s.key === spread)?.label ?? spread,
    [spread]
  );
  const toneLabel =
    tone === "warm" ? "やわらかめ" : tone === "neutral" ? "ニュートラル" : "はっきり";

  useEffect(() => {
    setDraft(preset.text);
    setSpread(preset.spread);
    setTone(preset.tone);
    setResultText(null);
  }, [preset.key]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const sc = loadScope();
    if (!isScopeReady(sc)) {
      router.replace("/welcome?reason=need_scope");
      return;
    }
    setScope(sc);
  }, [router]);

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
        router.replace("/login?reason=not_logged_in");
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      const email = session.user.email ?? null;
      if (!email) {
        await supabase.auth.signOut();
        router.replace("/login?reason=no_email");
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
        router.replace("/login?reason=invite_only");
        return;
      }

      setUserEmail(email);
      setCheckingAuth(false);

      const { data: deckRows } = await supabase
        .from("deck_library")
        .select("key, name")
        .order("name", { ascending: true });
      const list = (deckRows ?? []) as DeckRow[];
      setDecks(list);

      if (list.some((d) => d.key === "rws")) setDeckKey("rws");
      else if (list[0]?.key) setDeckKey(list[0].key);

      const { data: up } = await supabase
        .from("user_profile")
        .select("birth_date")
        .eq("user_id", uid)
        .maybeSingle();

      if (!cancelled) setUserBirthDate((up as any)?.birth_date ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // client birth_date
  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (!scope) return;
      if (scope.targetType !== "client" || !scope.clientProfileId) {
        setClientBirthDate(null);
        return;
      }

      const { data, error } = await supabase
        .from("client_profiles")
        .select("birth_date")
        .eq("id", scope.clientProfileId)
        .maybeSingle();

      if (cancelled) return;
      if (error) {
        setClientBirthDate(null);
        return;
      }
      setClientBirthDate((data as any)?.birth_date ?? null);
    })();

    return () => {
      cancelled = true;
    };
  }, [scope]);

  // moon
  useEffect(() => {
    const update = () => {
      const age = moonAgeDaysJST(new Date());
      setMoon({ ageDays: age, phaseLabel: moonPhaseLabel(age), pct: moonPct(age) });
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  // weather
  useEffect(() => {
    let cancelled = false;

    (async () => {
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
      } catch {
        if (cancelled) return;
        setWeather(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  async function copyText(s: string) {
    try {
      await navigator.clipboard.writeText(s);
    } catch {}
  }

  async function generateOnce() {
    if (!scope) return;

    setErr(null);
    setGenerating(true);
    setResultText(null);

    try {
      const theme = scopeLabel(scope);
      const title = `New / ${deckKey} / ${spreadLabel} / ${toneLabel} / ${lengthLabel(lengthPreset)}`;
      const guard = "\n\n【ルール】AIはユーザーに追加質問をしない。鑑定文だけで完結させる。";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme,
          title,
          mode: "normal",
          deckKey,
          spreadKey: spread,
          tone,
          lengthPreset, // ✅ 追加
          cardsText: String(draft ?? "") + guard,

          userId,
          targetType: scope?.targetType ?? null,
          clientProfileId: scope?.targetType === "client" ? scope.clientProfileId : null,
          userBirthDate,
          clientBirthDate,
          weather,
          moon,
        }),
      });

      const data = (await res.json().catch(() => null)) as GenerateResp | null;
      if (!res.ok) {
        const msg = (data as any)?.message ?? `生成に失敗しました（${res.status}）`;
        throw new Error(msg);
      }
      if (!data || (data as any).ok !== true || typeof (data as any).text !== "string") {
        throw new Error("生成結果の形式が想定と違います（text が見つかりません）");
      }

      setResultText((data as GenerateOk).text);
    } catch (e: any) {
      setErr(e?.message ?? "生成に失敗しました");
      setResultText(null);
    } finally {
      setGenerating(false);
    }
  }

  function goChatWithContext() {
    try {
      localStorage.setItem(
        "tarot_chat_seed",
        JSON.stringify({
          deckKey,
          spread,
          tone,
          draft,
          createdAt: Date.now(),
          initialReadingText: resultText ?? null,
          scope,
        })
      );
    } catch {}
    router.push("/chat");
  }

  function finishHere() {
    setResultText(null);
    setErr(null);
  }

  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/6 text-white/60"
    );

  const ready = !generating;

  const selectBase =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 shadow-sm outline-none focus:border-white/20";

  const box =
    "rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl";

  if (!scope) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-3xl px-6 py-14">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-2xl">
            <div className="text-sm text-white/70">準備中…</div>
            <div className="mt-2 text-lg font-semibold">Welcomeでスコープを選んでから来てください</div>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <style jsx global>{`
        select {
          color-scheme: dark;
        }
        select option {
          background: #0b1020 !important;
          color: rgba(255, 255, 255, 0.92) !important;
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
                  {checkingAuth ? "確認中…" : userEmail ? `ログイン中：${userEmail}` : ""}
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

        <div className="relative mx-auto max-w-6xl px-4 py-7 pb-28 md:px-6 md:py-10 md:pb-32">
          {err ? (
            <div className="mb-4 rounded-2xl border border-rose-300/20 bg-rose-500/10 px-5 py-4 text-sm text-rose-100">
              {err}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[420px_1fr] md:gap-6">
            {/* LEFT */}
            <aside className="md:sticky md:top-[84px] self-start">
              <div className={box}>
                <div className="rounded-[22px] border border-white/10 bg-white/7 p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/60">NEW</div>
                  <div className="mt-1 text-base font-semibold text-white/90">ここで一時鑑定</div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                    いまの状況を、短く・強く言語化する。
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">PRESET</div>
                    <div className="mt-3 space-y-2">
                      {PRESETS.map((p) => (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => setPresetKey(p.key)}
                          className={clsx(
                            "w-full rounded-2xl border px-4 py-3 text-left transition",
                            p.key === presetKey
                              ? "border-white/25 bg-white/16 text-white"
                              : "border-white/10 bg-white/6 text-white/85 hover:bg-white/10"
                          )}
                        >
                          <div className="text-xs font-semibold">{p.title}</div>
                          <div className="mt-1 text-[11px] text-white/60">{p.desc}</div>
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">CONFIG</div>
                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/70">デッキ</div>
                        <select value={deckKey} onChange={(e) => setDeckKey(e.target.value)} className={selectBase}>
                          {decks.length === 0 ? <option value="rws">rws</option> : null}
                          {decks.map((d) => (
                            <option key={d.key} value={d.key}>
                              {d.name ?? d.key}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/70">スプレッド</div>
                        <select
                          value={spread}
                          onChange={(e) => setSpread(e.target.value as SpreadKey)}
                          className={selectBase}
                        >
                          {SPREADS.map((s) => (
                            <option key={s.key} value={s.key}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/70">トーン</div>
                        <select value={tone} onChange={(e) => setTone(e.target.value as ToneKey)} className={selectBase}>
                          <option value="warm">やわらかめ</option>
                          <option value="neutral">ニュートラル</option>
                          <option value="direct">はっきり</option>
                        </select>
                      </div>

                      {/* ✅ 追加：鑑定文量 */}
                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/70">鑑定文量</div>
                        <select
                          value={lengthPreset}
                          onChange={(e) => setLengthPreset(e.target.value as LengthPreset)}
                          className={selectBase}
                        >
                          <option value="short">短め</option>
                          <option value="normal">ふつう</option>
                          <option value="deep">深掘り</option>
                        </select>
                      </div>

                      <div className="text-xs text-white/55">
                        材料：生年月日 {userBirthDate ? "✓" : "—"} / 天気 {weather ? "✓" : "—"} / 月{" "}
                        {moon ? "✓" : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-white/45">Tarot Studio / private beta</div>
                </div>
              </div>
            </aside>

            {/* RIGHT */}
            <section
              className={clsx(
                "rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-6"
              )}
            >
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={chip(true)}>入れ物：{scopeLabel(scope)}</span>
                  <span className={chip(true)}>デッキ：{deckKey}</span>
                  <span className={chip(true)}>スプレッド：{spreadLabel}</span>
                  <span className={chip(true)}>トーン：{toneLabel}</span>
                  <span className={chip(true)}>鑑定文量：{lengthLabel(lengthPreset)}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setDraft(preset.text);
                    setResultText(null);
                    setErr(null);
                  }}
                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                >
                  下書きリセット
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">INPUT</div>
                <div className="mt-2 text-lg font-semibold text-white">相談文</div>
                <div className="mt-1 text-sm text-white/55">ここで一時鑑定まで。</div>

                <div className="mt-4">
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    rows={14}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white/90 shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                    placeholder="ここに相談内容を書いてください"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => copyText(draft)}
                    className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    下書きコピー
                  </button>
                  <span className="text-xs text-white/45">下の「鑑定する」は常時表示</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">RESULT</div>
                <div className="mt-2 text-lg font-semibold text-white">一時鑑定</div>
                <div className="mt-1 text-sm text-white/55">必要ならこのあとChatへ。</div>

                {!resultText ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/65">
                    （まだありません）
                  </div>
                ) : (
                  <>
                    <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-8 text-white/90">
                      {resultText}
                    </pre>

                    <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => copyText(resultText)}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                      >
                        結果コピー
                      </button>
                      <button
                        type="button"
                        onClick={finishHere}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                      >
                        ここで終わり
                      </button>
                      <button
                        type="button"
                        onClick={goChatWithContext}
                        className="rounded-xl border border-white/18 bg-white/14 px-3 py-2 text-xs font-semibold text-white shadow-sm hover:bg-white/18"
                        disabled={!resultText}
                      >
                        補足がある→Chatへ
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 text-xs text-white/55">private beta</div>
            </section>
          </div>

          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
            <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                  <span className={chip(true)}>{scopeLabel(scope)}</span>
                  <span className={chip(true)}>{deckKey}</span>
                  <span className={chip(true)}>{spreadLabel}</span>
                  <span className={chip(true)}>{toneLabel}</span>
                  <span className={chip(true)}>{lengthLabel(lengthPreset)}</span>
                  {generating ? <span className="text-white/45">※鑑定中…</span> : null}
                </div>

                <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                  <button
                    type="button"
                    onClick={generateOnce}
                    disabled={!ready}
                    className={clsx(
                      "rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm transition",
                      ready
                        ? "border-white/18 bg-white/14 text-white hover:bg-white/18"
                        : "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                    )}
                  >
                    {generating ? "鑑定中…" : "鑑定する"}
                  </button>

                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      href="/read"
                      className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                    >
                      相談履歴
                    </Link>

                    <Link
                      href="/chat"
                      className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                    >
                      AI対話相談
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