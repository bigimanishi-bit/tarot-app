// app/quick/page.tsx
"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { loadScope, isScopeReady, scopeLabel, type TarotScope } from "@/lib/scope";

type ToneKey = "warm" | "neutral" | "direct";
type SpreadKey = "one_card" | "three_cards";

type GenerateOk = { ok: true; text: string; prompt_updated_at?: string | null };
type GenerateNg = { ok: false; message?: string };
type GenerateResp = GenerateOk | GenerateNg;

type WeatherPayload = {
  locationLabel?: string | null;
  weatherLabel?: string | null;
  currentTempC?: number | null;
  todayMaxC?: number | null;
  todayMinC?: number | null;
};

type MoonPayload = {
  ageDays?: number | null;
  phaseLabel?: string | null;
  pct?: number | null;
};

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

const RWS_NAMES: string[] = [
  "The Fool","The Magician","The High Priestess","The Empress","The Emperor","The Hierophant","The Lovers",
  "The Chariot","Strength","The Hermit","Wheel of Fortune","Justice","The Hanged Man","Death","Temperance",
  "The Devil","The Tower","The Star","The Moon","The Sun","Judgement","The World",
  "Ace of Cups","Two of Cups","Three of Cups","Four of Cups","Five of Cups","Six of Cups","Seven of Cups",
  "Eight of Cups","Nine of Cups","Ten of Cups","Page of Cups","Knight of Cups","Queen of Cups","King of Cups",
  "Ace of Wands","Two of Wands","Three of Wands","Four of Wands","Five of Wands","Six of Wands","Seven of Wands",
  "Eight of Wands","Nine of Wands","Ten of Wands","Page of Wands","Knight of Wands","Queen of Wands","King of Wands",
  "Ace of Swords","Two of Swords","Three of Swords","Four of Swords","Five of Swords","Six of Swords","Seven of Swords",
  "Eight of Swords","Nine of Swords","Ten of Swords","Page of Swords","Knight of Swords","Queen of Swords","King of Swords",
  "Ace of Pentacles","Two of Pentacles","Three of Pentacles","Four of Pentacles","Five of Pentacles","Six of Pentacles","Seven of Pentacles",
  "Eight of Pentacles","Nine of Pentacles","Ten of Pentacles","Page of Pentacles","Knight of Pentacles","Queen of Pentacles","King of Pentacles",
];

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
function pickUnique(arr: string[], n: number) {
  const copy = [...arr];
  const out: string[] = [];
  for (let i = 0; i < n && copy.length > 0; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    out.push(copy[idx]);
    copy.splice(idx, 1);
  }
  return out;
}

// ---- Weather ----
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
function moonPct(age: number) {
  const syn = 29.530588;
  const t = age / syn;
  if (t <= 0.5) return Math.round((t / 0.5) * 100);
  return Math.round((1 - (t - 0.5) / 0.5) * 100);
}

export default function QuickPage() {
  const router = useRouter();

  const [booting, setBooting] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [spread, setSpread] = useState<SpreadKey>("one_card");
  const [tone, setTone] = useState<ToneKey>("direct");

  const [question, setQuestion] = useState("");
  const [cards, setCards] = useState<string[] | null>(null);

  const [generating, setGenerating] = useState(false);
  const [resultText, setResultText] = useState<string | null>(null);

  // 材料
  const [userId, setUserId] = useState<string | null>(null);
  const [userBirthDate, setUserBirthDate] = useState<string | null>(null);
  const [clientBirthDate, setClientBirthDate] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherView | null>(null);
  const [moon, setMoon] = useState<{ ageDays: number; phaseLabel: string; pct: number } | null>(null);

  // auth + scope + user_profile
  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setErr(null);

      const sc = loadScope();
      if (!isScopeReady(sc)) {
        router.replace("/welcome?reason=need_scope");
        return;
      }
      setScope(sc);

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setErr(sessionErr.message);
        setBooting(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login?reason=not_logged_in");
        return;
      }

      const uid = session.user.id;
      setUserId(uid);

      const { data: up } = await supabase
        .from("user_profile")
        .select("birth_date")
        .eq("user_id", uid)
        .maybeSingle();
      if (!cancelled) setUserBirthDate((up as any)?.birth_date ?? null);

      setBooting(false);
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

  function drawCards() {
    setErr(null);
    setResultText(null);
    const n = spread === "one_card" ? 1 : 3;
    setCards(pickUnique(RWS_NAMES, n));
  }

  function buildCardsText(): string {
    const q = question.trim();
    const picked = cards ?? [];
    if (spread === "one_card") {
      const c1 = picked[0] ?? "";
      return ["【AI】", q ? `状況：${q}` : "状況：", `カード：${c1}`].join("\n");
    } else {
      const c1 = picked[0] ?? "";
      const c2 = picked[1] ?? "";
      const c3 = picked[2] ?? "";
      return [
        "【AI】",
        q ? `状況：${q}` : "状況：",
        `現状：${c1}`,
        `課題：${c2}`,
        `助言：${c3}`,
      ].join("\n");
    }
  }

  async function generate() {
    if (!scope) return;
    if (!cards || cards.length === 0) {
      setErr("先に引いてください");
      return;
    }

    setErr(null);
    setGenerating(true);
    setResultText(null);

    try {
      const theme = scopeLabel(scope);
      const title = `AI / rws / ${spread === "one_card" ? "1枚" : "3枚"} / ${tone}`;
      const guard = "\n\n【ルール】AIはユーザーに追加質問をしない。鑑定文だけで完結させる。";

      const spreadKey = spread === "one_card" ? "one_card" : "past_present_future";

      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          theme,
          title,
          mode: "normal",
          deckKey: "rws",
          spreadKey,
          tone,
          cardsText: buildCardsText() + guard,

          userId,
          targetType: scope?.targetType ?? null,
          clientProfileId: scope?.targetType === "client" ? scope.clientProfileId : null,
          userBirthDate,
          clientBirthDate,
          weather: (weather ?? null) as WeatherPayload | null,
          moon: (moon ?? null) as MoonPayload | null,
        }),
      });

      const data = (await res.json().catch(() => null)) as GenerateResp | null;

      if (!res.ok) {
        const msg = (data as any)?.message ?? `生成に失敗しました（${res.status}）`;
        throw new Error(msg);
      }
      if (!data || (data as any).ok !== true || typeof (data as any).text !== "string") {
        throw new Error("生成結果が不正です");
      }

      setResultText((data as GenerateOk).text);
    } catch (e: any) {
      setErr(e?.message ?? "生成に失敗しました");
      setResultText(null);
    } finally {
      setGenerating(false);
    }
  }

  function copyText(s: string) {
    navigator.clipboard.writeText(s).catch(() => {});
  }

  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/6 text-white/60"
    );

  const box =
    "rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl";

  const selectClass =
    "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/90 shadow-sm outline-none focus:border-white/20";

  if (booting || !scope) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-4xl px-6 py-14">
          <div className={clsx(box, "p-6")}>
            <div className="text-sm text-white/70">準備中…</div>
          </div>
        </div>
      </main>
    );
  }

  const canGo = !!cards?.length;
  const ready = canGo && !generating;

  return (
    <main className="min-h-screen">
      {/* ✅ layout触らず option白問題を潰す（このページだけ） */}
      <style jsx global>{`
        select { color-scheme: dark; }
        select option {
          background: #0b1020 !important;
          color: rgba(255,255,255,0.92) !important;
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

        {/* ✅ Header（Welcomeと同型） */}
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

        {/* ✅ Footerぶん余白 */}
        <div className="relative mx-auto max-w-6xl px-4 py-7 pb-28 md:px-6 md:py-10 md:pb-32">
          {err ? (
            <div className="mb-4 rounded-2xl border border-rose-200/30 bg-rose-500/10 px-5 py-4 text-sm text-rose-200 backdrop-blur-2xl">
              {err}
            </div>
          ) : null}

          <div className="grid gap-4 md:grid-cols-[420px_1fr] md:gap-6">
            {/* LEFT */}
            <aside className="md:sticky md:top-[84px] self-start">
              <div className={box}>
                <div className="rounded-[22px] border border-white/10 bg-white/7 p-4">
                  <div className="text-xs font-semibold tracking-[0.18em] text-white/60">AI</div>
                  <div className="mt-1 text-base font-semibold text-white/90">AIがカードを引く</div>

                  <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/80">
                    {scopeLabel(scope)}
                  </div>

                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                    <div className="text-xs font-semibold tracking-[0.18em] text-white/55">CONFIG</div>

                    <div className="mt-3 space-y-3">
                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/70">枚数</div>
                        <select
                          value={spread}
                          onChange={(e) => {
                            setSpread(e.target.value as SpreadKey);
                            setCards(null);
                            setResultText(null);
                          }}
                          className={selectClass}
                        >
                          <option value="one_card">1枚</option>
                          <option value="three_cards">3枚</option>
                        </select>
                      </div>

                      <div>
                        <div className="mb-2 text-xs font-semibold text-white/70">鑑定強度</div>
                        <select value={tone} onChange={(e) => setTone(e.target.value as ToneKey)} className={selectClass}>
                          <option value="warm">やわらかめ</option>
                          <option value="neutral">ふつう</option>
                          <option value="direct">はっきり</option>
                        </select>
                      </div>

                      <button
                        type="button"
                        onClick={drawCards}
                        className="w-full rounded-2xl border border-white/15 bg-white/10 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-white/14"
                      >
                        カードを選ぶ
                      </button>

                      <div className="text-xs text-white/55">
                        材料：生年月日 {userBirthDate ? "✓" : "—"} / 天気 {weather ? "✓" : "—"} / 月 {moon ? "✓" : "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-3 text-xs text-white/45">Tarot Studio / private beta</div>
                </div>
              </div>
            </aside>

            {/* RIGHT */}
            <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_30px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-6">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/6 px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={chip(true)}>入れ物：{scopeLabel(scope)}</span>
                  <span className={chip(true)}>カード：AI</span>
                  <span className={chip(true)}>枚数：{spread === "one_card" ? "1枚" : "3枚"}</span>
                  <span className={chip(true)}>トーン：{tone}</span>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setQuestion("");
                    setCards(null);
                    setResultText(null);
                    setErr(null);
                  }}
                  className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                >
                  リセット
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">INPUT</div>
                <div className="mt-2 text-lg font-semibold text-white">相談内容</div>

                <div className="mt-4">
                  <textarea
                    value={question}
                    onChange={(e) => setQuestion(e.target.value)}
                    rows={4}
                    className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm leading-7 text-white/90 shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                    placeholder="例：今日は流れを良くしたい。いま何を意識するといい？／恋愛で一歩進めたい"
                  />
                </div>

                <div className="mt-3 flex items-center justify-between gap-2">
                  {question.trim() ? (
                    <button
                      type="button"
                      onClick={() => copyText(question)}
                      className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                    >
                      コピー
                    </button>
                  ) : (
                    <span className="text-xs text-white/45"> </span>
                  )}
                  <span className="text-xs text-white/45">下の「鑑定する」は常時表示</span>
                </div>
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">CARDS</div>
                <div className="mt-2 text-lg font-semibold text-white">指針</div>

                {!cards ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/65">
                    （まだありません）
                  </div>
                ) : (
                  <div className={clsx("mt-4 grid gap-3", cards.length === 1 ? "grid-cols-1" : "grid-cols-3")}>
                    {cards.map((name, i) => (
                      <div key={i} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                        <div className="flex items-center justify-center rounded-xl border border-white/10 bg-black/20 py-3">
                          <img
                            src={cardImageSrc(name)}
                            alt={name}
                            className="h-[160px] w-[110px] object-contain"
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = "none";
                            }}
                          />
                        </div>
                        <div className="mt-2 text-xs text-white/75">{name}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/7 p-5">
                <div className="text-xs font-semibold tracking-[0.18em] text-white/55">RESULT</div>
                <div className="mt-2 text-lg font-semibold text-white">鑑定結果</div>

                {!resultText ? (
                  <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-sm text-white/65">
                    （まだありません）
                  </div>
                ) : (
                  <>
                    <pre className="mt-4 whitespace-pre-wrap rounded-2xl border border-white/10 bg-white/5 p-4 text-sm leading-7 text-white/90">
                      {resultText}
                    </pre>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => copyText(resultText)}
                        className="rounded-xl border border-white/12 bg-white/8 px-3 py-2 text-xs font-semibold text-white/85 hover:bg-white/12"
                      >
                        結果コピー
                      </button>
                    </div>
                  </>
                )}
              </div>

              <div className="mt-5 text-xs text-white/55">private beta</div>
            </section>
          </div>

          {/* ✅ Footer（Welcomeと同型：下固定CTA） */}
          <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
            <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
              <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                  <span className={chip(true)}>{scopeLabel(scope)}</span>
                  <span className={chip(!!cards?.length)}>
                    {cards?.length ? `カードOK（${cards.length}枚）` : "カード未選択"}
                  </span>
                  {!ready ? <span className="text-white/45">※先にカードを選ぶ</span> : null}
                </div>

                <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                  <button
                    type="button"
                    onClick={generate}
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
                      つづき相談
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