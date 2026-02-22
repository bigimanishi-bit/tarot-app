// src/lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    // ✅ マジックリンク（#access_token形式）を自動で拾ってセッション化する
    detectSessionInUrl: true,
    persistSession: true,
    autoRefreshToken: true,

    // ✅ ここが噛み合わないと code_not_found になりがち
    // 受け取ってるリンクが #access_token なので implicit に合わせる
    flowType: "implicit",
  },
});