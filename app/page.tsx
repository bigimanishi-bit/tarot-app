"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Link from "next/link";

export default function Home() {
  const [status, setStatus] = useState("checking...");
  const [email, setEmail] = useState<string | null>(null);

  const refresh = async () => {
    const { data, error } = await supabase.auth.getSession();
    if (error) return setStatus("ERROR: " + error.message);

    const yes = !!data.session;
    setStatus("session = " + (yes ? "YES" : "NO"));
    setEmail(data.session?.user?.email ?? null);
  };

  useEffect(() => {
    refresh();
    const { data: sub } = supabase.auth.onAuthStateChange(() => refresh());
    return () => sub.subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    // onAuthStateChange が走って session = NO になる
  };

  return (
    <main style={{ padding: 16, maxWidth: 720 }}>
      <h1>tarot-app</h1>

      <p>{status}</p>
      {email ? <p>login: {email}</p> : null}

      <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
        <Link href="/login">Go to /login</Link>
        <Link href="/read">Go to /read</Link>
      </div>

      <button style={{ marginTop: 16, padding: 10 }} onClick={signOut}>
        Sign out
      </button>
    </main>
  );
}
