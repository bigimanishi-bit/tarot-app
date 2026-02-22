// app/api/readings/generate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

// Supabase（サーバ側）: Service Role があればそれ優先、なければ anon
function getSupabaseServer() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, service || anon);
}

function toneText(tone: string) {
  if (tone === "direct") return "はっきりめ（断定しすぎない）";
  if (tone === "neutral") return "ニュートラル";
  return "やわらかめ";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const title: string | null = body.title ?? null;
    const question: string = body.question ?? "";
    const spread: string = body.spread ?? "";
    const tone: string = body.tone ?? "warm";
    const cardsText: string = body.cardsText ?? "";
    const promptName: string = body.promptName ?? "rws_master";

    // ✅ /new から渡す deckKey（無い場合は rws 扱い）
    const deckKey: string = body.deckKey ?? "rws";

    if (!question || String(question).trim().length < 2) {
      return NextResponse.json({ error: "question is required" }, { status: 400 });
    }

    const sb = getSupabaseServer();

    // 1) 共通プロンプト取得（prompts: name=rws_master）
    const { data: pRow, error: pErr } = await sb
      .from("prompts")
      .select("content")
      .eq("name", promptName)
      .single();

    if (pErr) {
      // 取得できなくても最低限は動かす
      // （ただしエラーは返さず続行）
    }

    const baseInstruction =
      (pRow?.content as string | undefined) ??
      "あなたはRWS基準のタロット鑑定者。断定予言しない。カード名は出さない。";

    // 2) ✅ デッキ辞書/スタイルを deck_library から取得して “上乗せ”
    let deckAddon = "";
    try {
      const { data: dRow } = await sb
        .from("deck_library")
        .select("key, name, style_instruction, dictionary")
        .eq("key", deckKey)
        .eq("enabled", true)
        .single();

      if (dRow) {
        const deckName = (dRow as any).name ?? deckKey;
        const style = (dRow as any).style_instruction ?? "";
        const dict = (dRow as any).dictionary ?? "";

        deckAddon = [
          "【デッキ情報（必ず反映）】",
          `デッキキー: ${deckKey}`,
          `デッキ名: ${deckName}`,
          style ? `\n【デッキ別スタイル】\n${style}` : "",
          dict ? `\n【デッキ別辞書】\n${dict}` : "",
        ]
          .filter(Boolean)
          .join("\n");
      } else {
        deckAddon = `【デッキ情報】デッキキー: ${deckKey}（deck_libraryに見つからないため共通ルールのみで鑑定）`;
      }
    } catch {
      deckAddon = `【デッキ情報】デッキキー: ${deckKey}（deck_library取得に失敗したため共通ルールのみで鑑定）`;
    }

    // 3) OpenAI
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "OPENAI_API_KEY is missing" }, { status: 500 });
    }

    const model = process.env.OPENAI_MODEL || "gpt-5.2";

    const hardRules = `
    【絶対ルール】
    - 「読めない」「特定できない」「追加情報が必要」などの拒否は禁止。
    - カード入力が数字だけ（例：1〜5）の場合は「大アルカナ番号」として扱い、必ず鑑定を続行。
    - 正逆が不明な場合は「すべて正位置扱い」で続行。
    - 出力は鑑定本文のみ。質問で終わらない。選択肢も出さない。`;

    const userInput = [
      hardRules,
      title ? `【タイトル】${title}` : null,
      `【質問】${String(question).trim()}`,
      spread ? `【スプレッド】${spread}` : null,
      `【トーン】${toneText(tone)}`,
      cardsText ? `【カード入力】\n${String(cardsText).trim()}` : null,
    ]
      .filter(Boolean)
      .join("\n\n");

    // ✅ system は「共通ルール＋デッキ上乗せ」を連結
    const systemText = `${baseInstruction}\n\n${deckAddon}`.trim();

    const res = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          { role: "system", content: systemText },
          { role: "user", content: userInput },
        ],
      }),
    });

    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return NextResponse.json({ error: `OpenAI error: ${res.status} ${t}` }, { status: 500 });
    }

    const json = await res.json();

    const text = json?.output_text ?? json?.output?.[0]?.content?.[0]?.text ?? "";
    if (!text) {
      return NextResponse.json({ error: "No output_text" }, { status: 500 });
    }

    return NextResponse.json({ readingText: text });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "server error" }, { status: 500 });
  }
}