import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function POST(req: Request) {
  const body = await req.json();

  // user_id は今はダミーで入れる（あとでログイン確定できたら auth.uid() に寄せる）
  const user_id = body.user_id || "00000000-0000-0000-0000-000000000000";

  const payload = {
    user_id,
    title: body.title || "",
    theme: body.theme || "",
    cards_text: body.cards_text || "",
    mode: body.mode || "normal",
    result_text: body.result_text || "",
  };

  const { data, error } = await supabase
    .from("readings")
    .insert(payload)
    .select("id")
    .single();

  if (error) {
    return NextResponse.json({ ok: false, message: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, id: data.id });
}
