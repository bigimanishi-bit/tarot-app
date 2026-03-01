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

function buildContextBlock(args: {
  userBirthDate?: string | null;
  clientBirthDate?: string | null;
  weather?: WeatherPayload | null;
  moon?: MoonPayload | null;
  historySummary?: string | null;
}) {
  const lines: string[] = [];

  if (args.userBirthDate) lines.push(`【生年月日（あなた）】${args.userBirthDate}`);
  if (args.clientBirthDate) lines.push(`【生年月日（相談者）】${args.clientBirthDate}`);

  if (args.weather) {
    const w = args.weather;
    const tempNow =
      typeof w.currentTempC === "number" ? `${Math.round(w.currentTempC)}℃` : "—";
    const max =
      typeof w.todayMaxC === "number" ? `${Math.round(w.todayMaxC)}℃` : "—";
    const min =
      typeof w.todayMinC === "number" ? `${Math.round(w.todayMinC)}℃` : "—";
    lines.push(
      `【天気】${w.locationLabel ?? "—"} / ${w.weatherLabel ?? "—"} / いま${tempNow} 最高${max} 最低${min}`
    );
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

  if (params.targetType === "self") {
    q = q.eq("target_type", "self");
  }
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

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const theme = String(body?.theme ?? "");
    const title = String(body?.title ?? "");
    const mode = (body?.mode === "dictionary" ? "dictionary" : "normal") as
      | "normal"
      | "dictionary";

    // どっちでも受ける（cardsText / cards_text）
    const cardsText = String(body?.cardsText ?? body?.cards_text ?? "");

    // 任意（未送信でも壊れない）
    const deckKey = String(body?.deckKey ?? "");
    const spreadKey = String(body?.spreadKey ?? "");
    const tone = String(body?.tone ?? "");

    // 追加：鑑定材料（任意）
    const userId = String(body?.userId ?? "");
    const targetType = (
      body?.targetType === "client" ? "client" : body?.targetType === "self" ? "self" : null
    ) as "self" | "client" | null;
    const clientProfileId = String(body?.clientProfileId ?? "") || null;

    const userBirthDate = String(body?.userBirthDate ?? "") || null;
    const clientBirthDate = String(body?.clientBirthDate ?? "") || null;

    const weather = (body?.weather ?? null) as WeatherPayload | null;
    const moon = (body?.moon ?? null) as MoonPayload | null;

    // 履歴（server側で引ける時だけ）
    let historySummary: string | null = null;
    let historyCount = 0;
    if (userId) {
      const h = await fetchHistorySummary({
        userId,
        targetType,
        clientProfileId,
      });
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

    const out = await generateReadingText({
      theme,
      title,
      mode,
      cards_text: `${cardsText}${ctx}`,
      deck_key: deckKey || undefined,
      spread_key: spreadKey || undefined,
      tone: (tone as any) || undefined,
    });

    // ✅ ここから保存（userId がある時だけ）
    let savedReadingId: string | null = null;
    const sb = getServiceSupabase();
    if (sb && userId) {
      const cardsPayload = {
        scopeLabel: theme,
        deckKey: deckKey || null,
        spreadKey: spreadKey || null,
        tone: tone || null,
        mode,
        // 「鑑定カードの入力」だけを保存（今日の3枚は混ぜない）
        cardsText,
        userBirthDate,
        clientBirthDate,
        weather,
        moon,
        historyCount,
        // 要約全文は長くなるので保存しない（必要なら後でON）
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
          result_text: out.text,
        })
        .select("id")
        .limit(1);

      if (!insErr) {
        const r0 = (ins ?? [])[0] as any;
        savedReadingId = r0?.id ?? null;
      }
    }

    return NextResponse.json({
      ok: true,
      text: out.text,
      prompt_updated_at: out.prompt_updated_at ?? null,
      reading_id: savedReadingId,
      meta: {
        historyCount,
        used: {
          userBirthDate: !!userBirthDate,
          clientBirthDate: !!clientBirthDate,
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