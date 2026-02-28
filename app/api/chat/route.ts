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

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

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

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // ---- env
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Supabase env is missing" }, { status: 500 });
    }

    // ① 認証：Bearer token 必須
    const token = getBearerToken(req);
    if (!token) {
      return NextResponse.json(
        { error: "Authorization Bearer token is required" },
        { status: 401 }
      );
    }

    // ② tokenからユーザー取得（anon権限でOK）
    const authClient = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });

    const { data: userRes, error: userErr } = await authClient.auth.getUser();
    const user = userRes?.user ?? null;
    if (userErr || !user) {
      return NextResponse.json({ error: "Invalid session" }, { status: 401 });
    }

    const user_id = user.id;
    const email = (user.email || "").toLowerCase().trim();
    if (!email) return NextResponse.json({ error: "email is missing on user" }, { status: 401 });

    // ③ allowlist チェック（service roleで参照）
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data: allow, error: allowErr } = await admin
      .from("allowlist")
      .select("enabled")
      .eq("email", email)
      .maybeSingle();

    if (allowErr) return NextResponse.json({ error: allowErr.message }, { status: 500 });
    if (!allow?.enabled) {
      return NextResponse.json({ error: "Forbidden (not invited)" }, { status: 403 });
    }

    // ---- chat_companion prompt（Supabase prompts から取得）
    const { data: promptRow, error: promptErr } = await admin
      .from("prompts")
      .select("content, updated_at")
      .eq("name", "chat_companion")
      .maybeSingle();

    const companionPrompt =
      !promptErr && promptRow?.content
        ? String(promptRow.content)
        : [
            "あなたはチャット相棒。",
            "占い師ではなく、人として寄り添い自然に会話する。",
            "一手/確度/分岐など定型は禁止。説教しない。",
            "行動アドバイスは求められた時だけ。",
            "カードの意味を聞かれた時だけ辞書を引用して説明する。",
          ].join("\n");

    // ---- 入力の取り方：question or messages最後のuser
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

    const wantDictionary = isDictionaryQuestion(question);

    // ---- deck の辞書を拾う（必要な時だけ）
    let deck: DeckRow | null = null;
    if (wantDictionary && deckKey) {
      const { data } = await admin
        .from("deck_library")
        .select("key,name,style_instruction,dictionary")
        .eq("key", deckKey)
        .maybeSingle();
      deck = (data as DeckRow) ?? null;
    }

    // ---- OpenAI
    const apiKey = getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }
    const client = new OpenAI({ apiKey });

    // ---- messages を “会話” として渡す（JSON化しない）
    const history: ChatMessage[] = Array.isArray(body?.messages)
      ? body.messages
          .filter(
            (m: any) => m && (m.role === "user" || m.role === "assistant") && m.content != null
          )
          .slice(-20)
          .map((m: any) => ({
            role: m.role,
            content: safeText(m.content),
          }))
      : [];

    const systemParts: string[] = [];
    systemParts.push(companionPrompt);

    const ctxLines: string[] = [];
    if (scopeLabel) ctxLines.push(`スコープ: ${scopeLabel}`);
    if (initialReadingText) {
      ctxLines.push("参考（Newの一時鑑定結果。背景として理解するだけ）：");
      ctxLines.push(initialReadingText);
    }
    if (ctxLines.length) systemParts.push(ctxLines.join("\n"));

    if (wantDictionary) {
      systemParts.push(
        [
          "【辞書モード】ユーザーが意味を聞いているので、必要に応じて辞書を引用して説明する。",
          "・まず短く答える→次に辞書から根拠を引用（抜粋）→最後に会話として一言添える。",
          "・引用は長くしすぎない（短い抜粋）。",
        ].join("\n")
      );

      if (deck?.dictionary) systemParts.push(`【辞書】\n${deck.dictionary}`);
      else systemParts.push("【辞書】（未設定）辞書が無い場合は一般的な範囲で説明してよい。");
    }

    const messages: ChatMessage[] = [
      { role: "system", content: systemParts.join("\n\n") },
      ...history,
      { role: "user", content: question },
    ];

    const model = (getEnv("OPENAI_MODEL") || "gpt-4.1-mini") as string;

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
      max_tokens: wantDictionary ? 800 : 650,
    });

    const out = (completion.choices?.[0]?.message?.content ?? "").trim();
    if (!out) return NextResponse.json({ error: "No output" }, { status: 500 });

    await admin.from("readings").insert({
      user_id,
      theme: typeof body?.theme === "string" ? body.theme : null,
      title: typeof body?.title === "string" ? body.title : null,
      cards_text: safeText({
        scopeLabel,
        deckKey,
        wantDictionary,
        question,
        messagesCount: history.length,
        hasInitialReadingText: !!initialReadingText,
      }),
      result_text: out,
    });

    return NextResponse.json({ readingText: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ? String(e.message) : "server_error" },
      { status: 500 }
    );
  }
}