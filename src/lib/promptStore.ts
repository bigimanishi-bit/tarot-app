// src/lib/promptStore.ts
import { supabase } from "@/lib/supabaseClient";

export async function getPromptByName(name: string) {
  const { data, error } = await supabase
    .from("prompts")
    .select("content, updated_at")
    .eq("name", name)
    .single();

  if (error) throw new Error("prompt fetch failed: " + error.message);
  if (!data?.content) throw new Error("prompt is empty");

  return {
    content: data.content as string,
    updated_at: data.updated_at as string,
  };
}