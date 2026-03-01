// app/api/generate/route.ts
import { NextResponse } from "next/server";
import { generateReadingText } from "@/lib/readingGenerator";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

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

function short(s: string, n: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

// -----------------------------
// 数秘
// -----------------------------
function digitsOnly(birthDate: string | null | undefined) {
  const s = String(birthDate ?? "").trim();
  if (!s) return "";
  return s.replace(/[^0-9]/g, "");
}

function sumDigitsStr(x: string) {
  return x.split("").reduce((a, ch) => a + (ch >= "0" && ch <= "9" ? Number(ch) : 0), 0);
}

// 運命数（ライフパス）：生年月日を全部足して還元（11/22/33は保持）
function numerologyLifePath(birthDate: string | null | undefined): number | null {
  const digits = digitsOnly(birthDate);
  if (!digits) return null;

  let n = sumDigitsStr(digits);
  const reduceOnce = (v: number) => sumDigitsStr(String(v));

  for (let i = 0; i < 10; i++) {
    if (n === 11 || n === 22 || n === 33) return n;
    if (n >= 1 && n <= 9) return n;
    n = reduceOnce(n);
  }
  if (n === 11 || n === 22 || n === 33) return n;
  if (n >= 1 && n <= 9) return n;
  return null;
}

// 個人年（パーソナルイヤー）：月+日+西暦（還元、11/22/33保持しない版でOK）
function numerologyPersonalYear(
  birthDate: string | null | undefined,
  now = new Date()
): number | null {
  const digits = digitsOnly(birthDate);
  if (digits.length < 8) return null;

  const mm = digits.slice(4, 6);
  const dd = digits.slice(6, 8);
  const yyyy = String(now.getFullYear());

  let n = sumDigitsStr(mm) + sumDigitsStr(dd) + sumDigitsStr(yyyy);

  const reduce = (v: number) => {
    let x = v;
    while (x > 9) x = sumDigitsStr(String(x));
    return x;
  };

  n = reduce(n);
  return n >= 1 && n <= 9 ? n : null;
}

// 数秘の「今回用」ヒント（テンプレを避けて “刺さる言葉” にする）
function lifePathHint(lp: number | null) {
  if (lp == null) return null;

  const map: Record<number, string> = {
    1: "決めたい。主導権を取りたい。曖昧が続くと焦りが強くなる。",
    2: "空気を読みすぎて消耗しやすい。反応がないと『自分が悪い？』に寄りやすい。",
    3: "言葉で確かめたい。沈黙が続くと不安が膨らみ、思考が散りやすい。",
    4: "事実と手順で安心したい。返事がない状態が長いほど足場が崩れやすい。",
    5: "情報の流れが止まるのが一番きつい。『未確定』が続くと想像が暴走しやすい。",
    6: "関係を守りたい責任感が強い。相手の沈黙を自分の課題として抱え込みやすい。",
    7: "答えを深掘りしたくなる。反応がないと考え続けて疲弊しやすい。",
    8: "現実を動かしたい。停滞が続くほど苛立ちと焦燥が増えやすい。",
    9: "意味づけして耐えようとする。相手の沈黙に『理由』を探しすぎやすい。",
    11: "感受性が鋭い。小さな兆候で心が上下しやすい（過敏になりやすい）。",
    22: "現実を組み直したい。状況が崩れると『全部を背負う』方向に寄りやすい。",
    33: "相手の痛みを想像して抱え込みやすい。境界が薄くなりやすい。",
  };

  return map[lp] ?? null;
}

function personalYearHint(py: number | null) {
  if (py == null) return null;
  const map: Record<number, string> = {
    1: "始め直し／方向転換がテーマになりやすい年。",
    2: "保留と調整。結論が出るまで時間がかかりやすい年。",
    3: "言葉・連絡・発信。やり取りの質が鍵になりやすい年。",
    4: "手続き・土台固め。現実の整理が前に出やすい年。",
    5: "変化・移動・揺れ。状況が動きやすい年。",
    6: "関係と責任。家族・約束・ケアの比重が増えやすい年。",
    7: "内省。答えが外より内側に寄りやすい年。",
    8: "決着と現実。お金・権利・条件が前に出やすい年。",
    9: "区切り。手放しと清算がテーマになりやすい年。",
  };
  return map[py] ?? null;
}

// -----------------------------
// Context block
// -----------------------------
function buildContextBlock(args: {
  userBirthDate?: string | null;
  clientBirthDate?: string | null;
  weather?: WeatherPayload | null;
  moon?: MoonPayload | null;
  historySummary?: string | null;
}) {
  const lines: string[] = [];

  const userLP = numerologyLifePath(args.userBirthDate);
  const clientLP = numerologyLifePath(args.clientBirthDate);

  const userPY = numerologyPersonalYear(args.userBirthDate);
  const clientPY = numerologyPersonalYear(args.clientBirthDate);

  if (args.userBirthDate) lines.push(`【生年月日（あなた）】${args.userBirthDate}`);
  if (args.clientBirthDate) lines.push(`【生年月日（相談者）】${args.clientBirthDate}`);

  // ✅ Systemが拾う表記で数秘を渡す
  if (userLP != null || clientLP != null || userPY != null || clientPY != null) {
    const uLpHint = lifePathHint(userLP);
    const cLpHint = lifePathHint(clientLP);
    const uPyHint = personalYearHint(userPY);
    const cPyHint = personalYearHint(clientPY);

    lines.push(`【数秘】運命数（ライフパス）：あなた ${userLP ?? "—"} / 相談者 ${clientLP ?? "—"}`);
    if (uLpHint) lines.push(`【数秘】ライフパスの刺さり方（あなた）：${uLpHint}`);
    if (cLpHint) lines.push(`【数秘】ライフパスの刺さり方（相談者）：${cLpHint}`);

    lines.push(`【数秘】個人年（パーソナルイヤー）：あなた ${userPY ?? "—"} / 相談者 ${clientPY ?? "—"}`);
    if (uPyHint) lines.push(`【数秘】パーソナルイヤー（あなた）：${uPyHint}`);
    if (cPyHint) lines.push(`【数秘】パーソナルイヤー（相談者）：${cPyHint}`);

    lines.push("【数秘の使い方】決めつけ禁止。傾向を1点だけ使い、『いまの苦しさの出方』に1〜3文で結びつける。");
  }

  if (args.weather) {
    const w = args.weather;
    const tempNow = typeof w.currentTempC === "number" ? `${Math.round(w.currentTempC)}℃` : "—";
    const max = typeof w.todayMaxC === "number" ? `${Math.round(w.todayMaxC)}℃` : "—";
    const min = typeof w.todayMinC === "number" ? `${Math.round(w.todayMinC)}℃` : "—";
    lines.push(`【天気】${w.locationLabel ?? "—"} / ${w.weatherLabel ?? "—"} / いま${tempNow} 最高${max} 最低${min}`);
  }

  if (args.moon) {
    const m = args.moon;
    const age = typeof m.ageDays === "number" ? m.ageDays.toFixed(1) : "—";
    const pct = typeof m.pct === "number" ? `${m.pct}%` : "—";
    lines.push(`【月】${m.phaseLabel ?? "—"} / 月齢${age}日 / 満ち具合${pct}`);
  }

  if (args.historySummary) {
    lines.push("【過去の鑑定（要約）】");
    lines.push(args.historySummary);
  }

  if (lines.length === 0) return "";
  return `\n\n---\n[鑑定に使う追加情報]\n${lines.join("\n")}\n---\n`;
}

// -----------------------------
// Supabase
// -----------------------------
function getServiceSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SERVICE_ROLE ||
    process.env.SUPABASE_SERVICE_KEY ||
    "";

  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false } });
}

async function fetchHistorySummary(params: {
  userId: string;
  targetType?: "self" | "client" | null;
  clientProfileId?: string | null;
}) {
  const sb = getServiceSupabase();
  if (!sb) return { summary: null as string | null, count: 0 };

  let q = sb
    .from("readings")
    .select("id,created_at,title,theme,cards_text,result_text,target_type,client_profile_id")
    .eq("user_id", params.userId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (params.targetType === "self") q = q.eq("target_type", "self");
  if (params.targetType === "client") {
    q = q.eq("target_type", "client");
    if (params.clientProfileId) q = q.eq("client_profile_id", params.clientProfileId);
  }

  const { data, error } = await q;
  if (error || !data) return { summary: null as string | null, count: 0 };

  const rows = data as Array<{
    created_at: string | null;
    title: string | null;
    theme: string | null;
    cards_text: string | null;
    result_text: string | null;
  }>;

  const use = rows.slice(0, 5);
  const summary = use
    .map((r, i) => {
      const dt = r.created_at ? String(r.created_at).slice(0, 10) : "—";
      const ttl = r.title ? short(r.title, 26) : "（無題）";
      const th = r.theme ? short(r.theme, 40) : "";
      const rs = r.result_text ? short(r.result_text, 140) : "";
      const parts = [`${i + 1}. ${dt} ${ttl}`];
      if (th) parts.push(`   - テーマ: ${th}`);
      if (rs) parts.push(`   - 要旨: ${rs}`);
      return parts.join("\n");
    })
    .join("\n");

  return { summary, count: rows.length };
}

function safeJson(v: any) {
  try {
    return JSON.stringify(v);
  } catch {
    return JSON.stringify({ raw: String(v ?? "") });
  }
}

// ✅ generateReadingTextの返り値が「string」でも「{text: string}」でも拾う
function pickGeneratedText(gen: any) {
  if (typeof gen === "string") return { text: gen, prompt_updated_at: null as string | null };
  if (gen && typeof gen.text === "string") return { text: gen.text, prompt_updated_at: gen.prompt_updated_at ?? null };
  return { text: "", prompt_updated_at: null as string | null };
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const theme = String(body?.theme ?? "");
    const title = String(body?.title ?? "");
    const mode = (body?.mode === "dictionary" ? "dictionary" : "normal") as "normal" | "dictionary";

    const cardsText = String(body?.cardsText ?? body?.cards_text ?? "");
    const deckKey = String(body?.deckKey ?? "");
    const spreadKey = String(body?.spreadKey ?? "");
    const tone = String(body?.tone ?? "");

    const userId = String(body?.userId ?? "");
    const targetType = (
      body?.targetType === "client" ? "client" : body?.targetType === "self" ? "self" : null
    ) as "self" | "client" | null;
    const clientProfileId = String(body?.clientProfileId ?? "") || null;

    const userBirthDate = String(body?.userBirthDate ?? "") || null;
    const clientBirthDate = String(body?.clientBirthDate ?? "") || null;

    const weather = (body?.weather ?? null) as WeatherPayload | null;
    const moon = (body?.moon ?? null) as MoonPayload | null;

    let historySummary: string | null = null;
    let historyCount = 0;
    if (userId) {
      const h = await fetchHistorySummary({ userId, targetType, clientProfileId });
      historySummary = h.summary;
      historyCount = h.count;
    }

    const ctx = buildContextBlock({
      userBirthDate,
      clientBirthDate,
      weather,
      moon,
      historySummary,
    });

    const gen = await generateReadingText({
      theme,
      title,
      mode,
      cards_text: `${cardsText}${ctx}`,
      deck_key: deckKey || undefined,
      spread_key: spreadKey || undefined,
      tone: (tone as any) || undefined,
    } as any);

    const picked = pickGeneratedText(gen);
    if (!picked.text) throw new Error("empty generation");

    // DB保存（本文はデバッグ行なしで保存）
    let savedReadingId: string | null = null;
    const sb = getServiceSupabase();
    if (sb && userId) {
      const userLP = numerologyLifePath(userBirthDate);
      const clientLP = numerologyLifePath(clientBirthDate);
      const userPY = numerologyPersonalYear(userBirthDate);
      const clientPY = numerologyPersonalYear(clientBirthDate);

      const cardsPayload = {
        scopeLabel: theme,
        deckKey: deckKey || null,
        spreadKey: spreadKey || null,
        tone: tone || null,
        mode,
        cardsText,
        userBirthDate,
        clientBirthDate,
        numerology: {
          userLifePath: userLP,
          clientLifePath: clientLP,
          userPersonalYear: userPY,
          clientPersonalYear: clientPY,
        },
        weather,
        moon,
        historyCount,
        hasHistorySummary: !!historySummary,
      };

      const { data: ins, error: insErr } = await sb
        .from("readings")
        .insert({
          user_id: userId,
          theme: theme || null,
          title: title || null,
          mode: mode,
          target_type: targetType,
          client_profile_id: targetType === "client" ? clientProfileId : null,
          cards_text: safeJson(cardsPayload),
          result_text: picked.text,
        })
        .select("id")
        .limit(1);

      if (!insErr) {
        const r0 = (ins ?? [])[0] as any;
        savedReadingId = r0?.id ?? null;
      }
    }

    // 返す本文：デバッグONのときだけ「受信行」を末尾に出す
    const debugOn = String(process.env.TS_DEBUG_CONTEXT ?? "") === "1";
    const userLP = numerologyLifePath(userBirthDate);
    const clientLP = numerologyLifePath(clientBirthDate);
    const userPY = numerologyPersonalYear(userBirthDate);
    const clientPY = numerologyPersonalYear(clientBirthDate);

    const debugLine =
      `[受信] target=${targetType ?? "—"} ` +
      `userBirth=${userBirthDate ?? "—"} clientBirth=${clientBirthDate ?? "—"} ` +
      `LP(user=${userLP ?? "—"},client=${clientLP ?? "—"}) ` +
      `PY(user=${userPY ?? "—"},client=${clientPY ?? "—"}) ` +
      `weather=${weather?.weatherLabel ?? "—"} moon=${moon?.phaseLabel ?? "—"} history=${historyCount}`;

    const responseText = debugOn ? `${picked.text}\n${debugLine}` : picked.text;

    // ✅ 互換レスポンス（UIがどの形式を見ても拾えるように“全部盛り”）
    return NextResponse.json({
      ok: true,

      // 主キー
      text: responseText,

      // 旧/別実装向け
      result_text: responseText,
      result: { text: responseText },
      data: { text: responseText },

      prompt_updated_at: picked.prompt_updated_at,
      reading_id: savedReadingId,
      meta: {
        historyCount,
        used: {
          userBirthDate: !!userBirthDate,
          clientBirthDate: !!clientBirthDate,
          numerology: userLP != null || clientLP != null || userPY != null || clientPY != null,
          weather: !!weather,
          moon: !!moon,
        },
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? "generate failed" },
      { status: 500 }
    );
  }
}