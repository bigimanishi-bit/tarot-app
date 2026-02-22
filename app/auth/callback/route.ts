import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET(request: Request) {
  const url = new URL(request.url);

  // Supabaseが ?code=... を返す（成功時）
  const code = url.searchParams.get("code");

  if (!code) {
    // code が無いときはログイン失敗 or 期限切れ
    return NextResponse.redirect(new URL("/login?error=code_not_found", url.origin));
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const supabase = createClient(supabaseUrl, supabaseAnonKey);

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    return NextResponse.redirect(new URL("/login?error=" + encodeURIComponent(error.message), url.origin));
  }

  // 成功したらトップへ
  return NextResponse.redirect(new URL("/", url.origin));
}
