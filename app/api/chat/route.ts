// app/api/chat/route.ts
import { NextResponse } from "next/server";
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";

type DeckRow = {
  key: string;
  name: string | null;
  style_instruction: string | null;
  dictionary: string | null;
};

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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

function getEnv(name: string) {
  const v = process.env[name];
  return v && v.trim() ? v : null;
}

function getBearerToken(req: Request) {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m?.[1]?.trim() || null;
}

function safeText(v: any) {
  if (typeof v === "string") return v;
  try {
    return JSON.stringify(v ?? "");
  } catch {
    return String(v ?? "");
  }
}

function isDictionaryQuestion(q: string) {
  const s = (q ?? "").trim();
  if (!s) return false;
  if (/(意味|解釈|キーワード|象徴|どういう|何を表す|教えて|辞書)/.test(s)) return true;
  if (
    /(the\s+|of\s+)(fool|magician|priestess|empress|emperor|hierophant|lovers|chariot|strength|hermit|wheel|justice|hanged|death|temperance|devil|tower|star|moon|sun|judgement|world)/i.test(
      s
    )
  )
    return true;
  if (
    /(塔|悪魔|死神|節制|世界|審判|太陽|月|星|戦車|恋人|皇帝|女帝|女教皇|魔術師|愚者|正義|運命の輪|隠者)/.test(
      s
    )
  )
    return true;
  return false;
}

function looksLikeThreeBullets(text: string) {
  const t = (text ?? "").trim();
  return /(^|\n)\s*1\)\s+/.test(t) && /(^|\n)\s*2\)\s+/.test(t) && /(^|\n)\s*3\)\s+/.test(t);
}

function short(s: string, n: number) {
  const t = (s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n) + "…" : t;
}

async function fetchHistorySummary(admin: any, params: {
  userId: string;
  targetType?: "self" | "client" | null;
  clientProfileId?: string | null;
}) {
  let q = admin
    .from("readings")
    .select("created_at,title,theme,result_text,target_type,client_profile_id")
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
    result_text: string | null;
  }>;

  const use = rows.slice(0, 5);
  const summary = use
    .map((r, i) => {
      const dt = r.created_at ? String(r.created_at).slice(0, 10) : "—";
      const ttl = r.title ? short(r.title, 26) : "（無題）";
      const th = r.theme ? short(r.theme, 36) : "";
      const rs = r.result_text ? short(r.result_text, 120) : "";
      const parts = [`${i + 1}. ${dt} ${ttl}`];
      if (th) parts.push(`   - テーマ: ${th}`);
      if (rs) parts.push(`   - 要旨: ${rs}`);
      return parts.join("\n");
    })
    .join("\n");

  return { summary, count: rows.length };
}

function buildContextLines(args: {
  scopeLabel?: string | null;
  initialReadingText?: string | null;
  userBirthDate?: string | null;
  clientBirthDate?: string | null;
  weather?: WeatherPayload | null;
  moon?: MoonPayload | null;
  historySummary?: string | null;
}) {
  const lines: string[] = [];

  if (args.scopeLabel) lines.push(`スコープ: ${args.scopeLabel}`);

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

  if (args.initialReadingText) {
    lines.push("参考（Newの一時鑑定。背景として理解するだけ）：");
    lines.push(args.initialReadingText);
  }

  if (args.historySummary) {
    lines.push("参考（過去の鑑定の要約。決めつけに使わない）：");
    lines.push(args.historySummary);
  }

  return lines;
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Supabase env is missing" }, { status: 500 });
    }

    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Authorization Bearer token is required" },
        { status: 401 }
      );
    }

    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    const user = userRes?.user ?? null;
    if (userErr || !user) return NextResponse.json({ error: "Invalid session" }, { status: 401 });

    const user_id = user.id;
    const email = (user.email || "").toLowerCase().trim();
    if (!email) return NextResponse.json({ error: "email is missing on user" }, { status: 401 });

    const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

    const { data: allow, error: allowErr } = await admin
      .from("allowlist")
      .select("enabled")
      .eq("email", email)
      .maybeSingle();

    if (allowErr) return NextResponse.json({ error: allowErr.message }, { status: 500 });
    if (!allow?.enabled) return NextResponse.json({ error: "Forbidden (not invited)" }, { status: 403 });

    // chat_companion prompt
    const { data: promptRow } = await admin
      .from("prompts")
      .select("content, updated_at")
      .eq("name", "chat_companion")
      .maybeSingle();

    const companionPrompt =
      promptRow?.content
        ? String(promptRow.content)
        : "あなたはチャット相棒。占い師ではなく寄り添い会話する。";

    // question
    const questionRaw =
      (typeof body?.question === "string" ? body.question : "") ||
      (Array.isArray(body?.messages)
        ? String(
            [...body.messages].reverse().find((m: any) => m?.role === "user")?.content ?? ""
          )
        : "");
    const question = questionRaw.trim();
    if (!question) return NextResponse.json({ error: "question is required" }, { status: 400 });

    const deckKey = typeof body?.deckKey === "string" ? body.deckKey : null;
    const scopeLabel = typeof body?.scopeLabel === "string" ? body.scopeLabel : null;
    const initialReadingText =
      typeof body?.initialReadingText === "string" ? body.initialReadingText : null;

    // ✅ scope情報（履歴の取得/保存に使う）
    const targetType =
      body?.targetType === "client" ? "client" : body?.targetType === "self" ? "self" : null;
    const clientProfileId =
      typeof body?.clientProfileId === "string" && body.clientProfileId.trim()
        ? body.clientProfileId.trim()
        : null;

    const wantDictionary = isDictionaryQuestion(question);

    // deck dictionary (only when needed)
    let deck: DeckRow | null = null;
    if (wantDictionary && deckKey) {
      const { data } = await admin
        .from("deck_library")
        .select("key,name,style_instruction,dictionary")
        .eq("key", deckKey)
        .maybeSingle();
      deck = (data as DeckRow) ?? null;
    }

    // ✅ 追加材料（任意）
    const userBirthDate =
      typeof body?.userBirthDate === "string" && body.userBirthDate.trim()
        ? body.userBirthDate.trim()
        : null;
    const clientBirthDate =
      typeof body?.clientBirthDate === "string" && body.clientBirthDate.trim()
        ? body.clientBirthDate.trim()
        : null;
    const weather = (body?.weather ?? null) as WeatherPayload | null;
    const moon = (body?.moon ?? null) as MoonPayload | null;

    // ✅ 履歴要約（serverで取得）
    const h = await fetchHistorySummary(admin, {
      userId: user_id,
      targetType,
      clientProfileId,
    });
    const historySummary = h.summary;

    // OpenAI
    const apiKey = getEnv("OPENAI_API_KEY");
    if (!apiKey) return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });

    const client = new OpenAI({ apiKey });
    const model = (getEnv("OPENAI_MODEL") || "gpt-4.1-mini") as string;

    const history: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .filter(
            (m: any) => m && (m.role === "user" || m.role === "assistant") && m.content != null
          )
          .slice(-20)
          .map((m: any) => ({ role: m.role, content: safeText(m.content) }))
      : [];

    // ✅ 根底ルール（固定）
    const foundation = [
      "根底ルール（厳守）",
      "タロットは相手の事実や内心を直接知る道具ではない。",
      "タロットは、相談者の観察・記憶・身体感覚・潜在意識から『言葉』を引き出す道具。",
      "第三者の内心・行動・所在・過去の出来事は断定しない（可能性の幅として述べる）。",
      "材料（履歴/生年月日/天気/月）は“文脈”として扱い、決めつけの根拠にしない。",
      "行動の指示はしない。相談者の気持ちを言語化し、整理し、落ち着ける返しを優先する。",
    ].join("\n");

    const systemParts: string[] = [companionPrompt, foundation];

    const ctxLines = buildContextLines({
      scopeLabel,
      initialReadingText,
      userBirthDate,
      clientBirthDate,
      weather,
      moon,
      historySummary,
    });
    if (ctxLines.length) systemParts.push(ctxLines.join("\n"));

    if (wantDictionary) {
      systemParts.push(
        [
          "【辞書モード】意味を聞かれた時だけ辞書を引用して説明する。",
          "短く答える→辞書から短い抜粋→会話として一言。",
        ].join("\n")
      );
      systemParts.push(deck?.dictionary ? `【辞書】\n${deck.dictionary}` : "【辞書】未設定");
    }

    const baseMessages: ChatMessage[] = [
      { role: "system", content: systemParts.join("\n\n") },
      ...history,
      { role: "user", content: question },
    ];

    // 1st try
    const first = await client.chat.completions.create({
      model,
      messages: baseMessages,
      temperature: 0.7,
      max_tokens: wantDictionary ? 800 : 650,
    });

    let out = (first.choices?.[0]?.message?.content ?? "").trim();

    // retry（必要な時だけ）
    if (!wantDictionary && !looksLikeThreeBullets(out)) {
      const tighten: ChatMessage[] = [
        ...baseMessages,
        {
          role: "system",
          content:
            "出力を短く整形して。次の形式だけで返して：\n" +
            "1) 可能性（1〜2文）\n2) 可能性（1〜2文）\n3) 可能性（1〜2文）\n" +
            "最後に共感の一文だけ。\n" +
            "前置きや同語反復は禁止。断定は禁止。",
        },
      ];

      const second = await client.chat.completions.create({
        model,
        messages: tighten,
        temperature: 0.6,
        max_tokens: 450,
      });

      const out2 = (second.choices?.[0]?.message?.content ?? "").trim();
      if (out2) out = out2;
    }

    if (!out) return NextResponse.json({ error: "No output" }, { status: 500 });

    // ✅ readings保存（履歴として使うので target_type / client_profile_id を入れる）
    await admin.from("readings").insert({
      user_id,
      theme: typeof body?.theme === "string" ? body.theme : null,
      title: typeof body?.title === "string" ? body.title : null,
      mode: wantDictionary ? "dictionary" : "chat",
      target_type: targetType,
      client_profile_id: targetType === "client" ? clientProfileId : null,
      cards_text: safeText({
        scopeLabel,
        deckKey,
        wantDictionary,
        question,
        messagesCount: history.length,
        hasInitialReadingText: !!initialReadingText,
        userBirthDate,
        clientBirthDate,
        weather,
        moon,
        historyCount: h.count,
      }),
      result_text: out,
    });

    return NextResponse.json({
      readingText: out,
      meta: {
        historyCount: h.count,
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
      { error: e?.message ? String(e.message) : "server_error" },
      { status: 500 }
    );
  }
}