import { NextResponse } from "next/server";
import { generateReadingText } from "@/lib/readingGenerator";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const theme = String(body?.theme ?? "");
    const title = String(body?.title ?? "");
    const mode = (body?.mode === "dictionary" ? "dictionary" : "normal") as
      | "normal"
      | "dictionary";

    // ✅ どっちでも受ける（cardsText / cards_text）
    const cardsText = String(body?.cardsText ?? body?.cards_text ?? "");

    // ✅ 追加：任意（未送信でも壊れない）
    const deckKey = String(body?.deckKey ?? "");
    const spreadKey = String(body?.spreadKey ?? "");
    const tone = String(body?.tone ?? "");

    const out = await generateReadingText({
      theme,
      title,
      mode,
      cards_text: cardsText,
      deck_key: deckKey || undefined,
      spread_key: spreadKey || undefined,
      tone: (tone as any) || undefined,
    });

    return NextResponse.json({
      ok: true,
      text: out.text,
      prompt_updated_at: out.prompt_updated_at ?? null,
    });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message ?? "generate failed" },
      { status: 500 }
    );
  }
}