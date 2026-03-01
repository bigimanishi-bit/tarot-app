// app/chat/page.tsx
"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "../../src/lib/supabaseClient";
import { loadScope, isScopeReady, scopeLabel, type TarotScope } from "../../src/lib/scope";

type ChatMsg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
  createdAt: number;
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

function makeId() {
  return `${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function storageKey(scope: TarotScope) {
  if (scope.targetType === "self") return "ts_chat_self";
  return `ts_chat_client_${scope.clientProfileId}`;
}

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

export default function ChatPage() {
  const router = useRouter();
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const [booting, setBooting] = useState(true);
  const [status, setStatus] = useState<string>("loading...");
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);

  const [scope, setScope] = useState<TarotScope | null>(null);

  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);

  // ✅ 鑑定材料（Chatにも渡す）
  const [userBirthDate, setUserBirthDate] = useState<string | null>(null);
  const [clientBirthDate, setClientBirthDate] = useState<string | null>(null);
  const [weather, setWeather] = useState<WeatherPayload | null>(null);
  const [moon, setMoon] = useState<{ ageDays: number; phaseLabel: string; pct: number } | null>(null);

  // newから渡す seed（あれば最初に流す）
  const seed = useMemo(() => {
    return safeJsonParse<{
      deckKey?: string;
      spread?: string;
      tone?: string;
      draft?: string;
      createdAt?: number;
      initialReadingText?: string | null;
      scope?: any;
    }>(typeof window !== "undefined" ? localStorage.getItem("tarot_chat_seed") : null);
  }, []);

  const [seedDeckKey] = useState<string | null>(seed?.deckKey ?? null);
  const [seedSpread] = useState<string | null>(seed?.spread ?? null);
  const [seedTone] = useState<string | null>(seed?.tone ?? null);
  const [seedInitialReadingText] = useState<string | null>(seed?.initialReadingText ?? null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setBooting(true);
      setStatus("loading...");

      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      if (cancelled) return;

      if (sessionErr) {
        setStatus(sessionErr.message);
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
      setUserEmail(session.user.email ?? null);

      const sc = loadScope();
      if (!isScopeReady(sc)) {
        router.replace("/welcome?reason=select_scope");
        return;
      }
      setScope(sc);

      const { data: up } = await supabase
        .from("user_profile")
        .select("birth_date")
        .eq("user_id", uid)
        .maybeSingle();

      if (!cancelled) setUserBirthDate((up as any)?.birth_date ?? null);

      setBooting(false);
      setStatus("ok");
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

  // moon（1分ごと）
  useEffect(() => {
    const update = () => {
      const age = moonAgeDaysJST(new Date());
      setMoon({ ageDays: age, phaseLabel: moonPhaseLabel(age), pct: moonPct(age) });
    };
    update();
    const t = setInterval(update, 60_000);
    return () => clearInterval(t);
  }, []);

  // weather（起動時に1回）
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

  // scopeが決まったらログ読み込み
  useEffect(() => {
    if (booting) return;
    if (!scope) return;

    const key = storageKey(scope);
    const saved = safeJsonParse<ChatMsg[]>(localStorage.getItem(key));
    if (saved?.length) {
      setMessages(saved);
      return;
    }

    if (seed?.draft?.trim()) {
      const initial: ChatMsg[] = [
        {
          id: makeId(),
          role: "system",
          text: "Welcomeで選んだscopeの相談ルームです（混ざりません）。",
          createdAt: Date.now(),
        },
        ...(seed?.initialReadingText?.trim()
          ? [
              {
                id: makeId(),
                role: "assistant",
                text:
                  "【一時鑑定（Newの結果）】\n" +
                  seed.initialReadingText.trim() +
                  "\n\n（この内容を前提に、ここから質問してOK）",
                createdAt: Date.now(),
              } as ChatMsg,
            ]
          : []),
        {
          id: makeId(),
          role: "user",
          text: seed.draft.trim(),
          createdAt: Date.now(),
        },
      ];

      setMessages(initial);

      try {
        localStorage.removeItem("tarot_chat_seed");
      } catch {}

      return;
    }

    setMessages([
      {
        id: makeId(),
        role: "system",
        text: "ここは つづき相談 です。\nNewで鑑定 → 追加の疑問が出たらここで相談。",
        createdAt: Date.now(),
      },
    ]);
  }, [booting, scope, seed]);

  // 保存（scopeごと）
  useEffect(() => {
    if (!scope) return;
    const key = storageKey(scope);
    try {
      localStorage.setItem(key, JSON.stringify(messages));
    } catch {}
  }, [messages, scope]);

  // 末尾スクロール
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  async function logout() {
    try {
      await supabase.auth.signOut();
    } finally {
      router.replace("/login?reason=signed_out");
    }
  }

  async function send() {
    if (sending) return;
    const text = input.trim();
    if (!text) return;
    if (!scope) return;

    const userMsg: ChatMsg = { id: makeId(), role: "user", text, createdAt: Date.now() };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);
    setStatus("sending...");

    try {
      const { data: sessionData, error: sessionErr } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token ?? null;
      if (sessionErr || !token) throw new Error("session token is missing");

      const res = await fetch("/api/chat", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          question: text,

          deckKey: seedDeckKey,
          spread: seedSpread,
          tone: seedTone,

          initialReadingText: seedInitialReadingText,
          scopeLabel: scopeLabel(scope),

          messages: messages.map((m) => ({
            role: m.role,
            content: m.text,
          })),

          theme: scopeLabel(scope),
          title: "Chat follow-up",
          scope,

          // 追加材料
          userId,
          targetType: scope.targetType,
          clientProfileId: scope.targetType === "client" ? scope.clientProfileId : null,
          userBirthDate,
          clientBirthDate,
          weather,
          moon,
        }),
      });

      const data = (await res.json().catch(() => null)) as any;

      if (!res.ok) {
        const msg = data?.error ?? data?.message ?? `api error: ${res.status}`;
        throw new Error(msg);
      }

      const reply = String(data?.readingText ?? "").trim();
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", text: reply || "（返答が空でした）", createdAt: Date.now() },
      ]);
      setStatus("ok");
    } catch (e: any) {
      setMessages((prev) => [
        ...prev,
        { id: makeId(), role: "assistant", text: `（送信に失敗）\n${e?.message ?? "error"}`, createdAt: Date.now() },
      ]);
      setStatus(e?.message ?? "error");
    } finally {
      setSending(false);
    }
  }

  const chip = (on: boolean) =>
    clsx(
      "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold",
      on ? "border-white/18 bg-white/12 text-white" : "border-white/10 bg-white/6 text-white/60"
    );

  if (booting) {
    return (
      <main className="min-h-screen bg-[#0B1020] text-white">
        <div className="mx-auto max-w-3xl px-4 py-10">
          <div className="rounded-2xl border border-white/12 bg-white/6 p-5 backdrop-blur-2xl">
            読み込み中…
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
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
                <span className="hidden text-xs text-white/55 md:inline">
                  {userEmail ? `ログイン中：${userEmail}` : ""}
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

        {/* ✅ Footerぶん余白 */}
        <div className="relative mx-auto max-w-6xl px-4 py-7 pb-28 md:px-6 md:py-10 md:pb-32">
          <div className="mb-4 rounded-2xl border border-white/10 bg-white/7 px-5 py-4">
            <div className="text-xs font-semibold tracking-[0.18em] text-white/55">CHAT</div>
            <div className="mt-2 text-xl font-semibold text-white">つづき相談</div>
            <div className="mt-1 text-sm text-white/55">scope：{scope ? scopeLabel(scope) : "—"}</div>
            <div className="mt-1 text-xs text-white/45">
              {status && status !== "ok" ? status : ""}
            </div>
          </div>

          <section className="rounded-[26px] border border-white/12 bg-white/6 p-4 shadow-[0_35px_110px_rgba(0,0,0,0.55)] backdrop-blur-2xl md:p-5">
            {/* ✅ メッセージ欄は下固定入力のぶん高さ確保 */}
            <div className="h-[62vh] overflow-auto rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="space-y-3">
                {messages.map((m) => (
                  <div
                    key={m.id}
                    className={clsx(
                      "max-w-[85%] whitespace-pre-wrap rounded-2xl border p-3 text-sm leading-7",
                      m.role === "user"
                        ? "ml-auto border-white/12 bg-white/10 text-white"
                        : m.role === "assistant"
                        ? "mr-auto border-white/10 bg-white/6 text-white/85"
                        : "mx-auto border-white/8 bg-white/4 text-white/65"
                    )}
                  >
                    {m.text}
                  </div>
                ))}
                <div ref={bottomRef} />
              </div>
            </div>

            <div className="mt-3 text-xs text-white/45">
              ※入力と送信は下に固定されています
            </div>
          </section>
        </div>

        {/* ✅ Footer（Welcomeと同型：下固定CTA） */}
        <div className="fixed inset-x-0 bottom-0 z-50 border-t border-white/10 bg-[#0B1020]/70 backdrop-blur-xl">
          <div className="mx-auto max-w-6xl px-4 py-3 md:px-6">
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
              <div className="flex flex-wrap items-center gap-2 text-xs text-white/70">
                <span className={chip(!!scope)}>{scope ? scopeLabel(scope) : "scope未選択"}</span>
                <span className={chip(!sending)}>{sending ? "送信中…" : "待機中"}</span>
                {!input.trim() ? <span className="text-white/45">※入力すると送信できます</span> : null}
              </div>

              <div className="grid grid-cols-2 gap-2 md:flex md:items-center">
                {/* 左：送信（モバイル主役） */}
                <button
                  type="button"
                  onClick={send}
                  disabled={sending || !input.trim()}
                  className={clsx(
                    "rounded-2xl border px-4 py-3 text-center text-sm font-semibold shadow-sm transition",
                    sending || !input.trim()
                      ? "cursor-not-allowed border-white/8 bg-white/5 text-white/35"
                      : "border-white/18 bg-white/14 text-white hover:bg-white/18"
                  )}
                >
                  {sending ? "送信中…" : "送信"}
                </button>

                {/* 右：履歴 / ホーム */}
                <div className="grid grid-cols-2 gap-2">
                  <Link
                    href="/read"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    相談履歴
                  </Link>

                  <Link
                    href="/welcome"
                    className="rounded-2xl border border-white/12 bg-white/8 px-3 py-3 text-center text-xs font-semibold text-white/85 hover:bg-white/12"
                  >
                    ホーム
                  </Link>
                </div>
              </div>
            </div>

            {/* ✅ 入力欄もフッター内に固定（モバイル最優先） */}
            <div className="mt-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="ここに相談を書く（Enterで改行）"
                rows={2}
                className="w-full resize-none rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white shadow-sm outline-none placeholder:text-white/35 focus:border-white/20"
                disabled={sending}
              />
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