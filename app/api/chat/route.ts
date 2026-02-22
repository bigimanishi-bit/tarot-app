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

function safeJson(v: any) {
  try {
    return JSON.stringify(v ?? null);
  } catch {
    return JSON.stringify({ note: "stringify_failed" });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({} as any));

    // ✅ question を必ず拾う（無ければ messages の最後の user を採用）
    const questionRaw =
      (typeof body?.question === "string" ? body.question : "") ||
      (Array.isArray(body?.messages)
        ? String(
            [...body.messages].reverse().find((m: any) => m?.role === "user")?.content ?? ""
          )
        : "");

    const question = questionRaw.trim();
    if (!question) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const deckKey = typeof body?.deckKey === "string" ? body.deckKey : null;
    const spread = body?.spread ?? null;
    const tone = typeof body?.tone === "string" ? body.tone : null;

    // ---- Supabase client（service role があれば優先）
    const supabaseUrl = getEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const serviceKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");

    const supabase =
      supabaseUrl && (serviceKey || anonKey)
        ? createClient(supabaseUrl, (serviceKey || anonKey) as string, {
            auth: { persistSession: false },
          })
        : null;

    // ---- deck_library から style/dictionary を拾う（あれば system に混ぜる）
    let deck: DeckRow | null = null;
    if (supabase && deckKey) {
      const { data } = await supabase
        .from("deck_library")
        .select("key,name,style_instruction,dictionary")
        .eq("key", deckKey)
        .maybeSingle();
      deck = (data as DeckRow) ?? null;
    }

    const sysParts: string[] = [];
    sysParts.push("あなたはタロット鑑定のアシスタント。断定せず、推測には確度を添える。");
    if (deck?.style_instruction) {
      sysParts.push(`【デッキ補正】\n${deck.style_instruction}`);
    }
    if (deck?.dictionary) {
      sysParts.push(`【辞書】\n${deck.dictionary}`);
    }
    if (tone) {
      sysParts.push(`【トーン】${tone}`);
    }

    const system = sysParts.join("\n\n");

    const userPayload = {
      question,
      deckKey,
      spread,
      tone,
      messages: Array.isArray(body?.messages) ? body.messages : null,
    };

    // ---- OpenAI
    const apiKey = getEnv("OPENAI_API_KEY");
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const client = new OpenAI({ apiKey });

    const messages = [
      { role: "system" as const, content: system },
      { role: "user" as const, content: safeJson(userPayload) },
    ];

    const model = (getEnv("OPENAI_MODEL") || "gpt-4.1-mini") as string;

    const completion = await client.chat.completions.create({
      model,
      messages,
      temperature: 0.7,
    });

    const out = (completion.choices?.[0]?.message?.content ?? "").trim();
    if (!out) {
      return NextResponse.json({ error: "No output" }, { status: 500 });
    }

    // ✅ readings 保存（deck_key は入れない）
    if (supabase) {
      await supabase.from("readings").insert({
        cards_text: safeJson(userPayload),
        result_text: out,
      });
    }

    return NextResponse.json({ readingText: out });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message ? String(e.message) : "server_error" },
      { status: 500 }
    );
  }
}