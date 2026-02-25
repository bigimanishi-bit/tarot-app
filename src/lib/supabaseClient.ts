// /lib/supabaseClient.ts
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// ✅ ビルド時に env が未解決でも落とさない
if (!supabaseUrl || !supabaseAnonKey) {
  console.warn("[supabaseClient] Missing env vars at build time");
}

// ✅ env がある時だけクライアントを作る
export const supabase =
  supabaseUrl && supabaseAnonKey
    ? createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          detectSessionInUrl: true,
          persistSession: true,
          autoRefreshToken: true,
        },
      })
    : (null as any);