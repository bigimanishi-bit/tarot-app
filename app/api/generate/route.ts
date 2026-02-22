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

    const out = await generateReadingText({
      theme,
      title,
      mode,
      cards_text: cardsText,
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