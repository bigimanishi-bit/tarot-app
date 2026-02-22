"use client";

import { useState } from "react";

export default function NewReadingPage() {
  const [theme, setTheme] = useState("恋愛");
  const [title, setTitle] = useState("離婚について");
  const [mode, setMode] = useState("normal"); // normal / dictionary
  const [cardsText, setCardsText] = useState("現状：７ワンド　課題：３ソード　助言：ジャスティス");

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState("");
  const [errorText, setErrorText] = useState("");

  async function onGenerate() {
    setLoading(true);
    setResult("");
    setErrorText("");

    try {
      // ★ここが重要：あなたのAPIのパスを固定で叩く
      const res = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          theme,
          title,
          mode,
          cards_text: cardsText,
        }),
      });

      const json = await res.json().catch(() => null);

      if (!res.ok) {
        setErrorText(
          "API ERROR\n" +
            "status: " + res.status + "\n" +
            "body: " + JSON.stringify(json, null, 2)
        );
        return;
      }

      // 成功時の返し方に対応
      const text =
        json?.text ||
        json?.result_text ||
        json?.result ||
        JSON.stringify(json);

      setResult(String(text));
    } catch (e: any) {
      setErrorText("CLIENT ERROR\n" + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main style={{ padding: 16, maxWidth: 760, margin: "0 auto" }}>
      <h1>new reading</h1>
      <p>ここは占い師用の入力画面。カードの並びはそのまま貼ってOK。</p>

      <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
        <label>
          テーマ
          <input
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          タイトル（任意）
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <label>
          モード
          <select
            value={mode}
            onChange={(e) => setMode(e.target.value)}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
          >
            <option value="normal">通常鑑定（カード名ゼロの鑑定文）</option>
            <option value="dictionary">📚辞書モード（辞書がメイン）</option>
          </select>
        </label>

        <label>
          カード一覧（例：現状：◯◯ / 課題：◯◯ / 助言：◯◯）
          <textarea
            value={cardsText}
            onChange={(e) => setCardsText(e.target.value)}
            rows={4}
            style={{ display: "block", width: "100%", padding: 8, marginTop: 6 }}
          />
        </label>

        <button
          onClick={onGenerate}
          disabled={loading}
          style={{ padding: 10, fontSize: 16 }}
        >
          {loading ? "生成中..." : "鑑定文を作る"}
        </button>

        {errorText ? (
          <pre style={{ whiteSpace: "pre-wrap", background: "#111", color: "#fff", padding: 12 }}>
            {errorText}
          </pre>
        ) : null}

        {result ? (
          <pre style={{ whiteSpace: "pre-wrap", background: "#f5f5f5", padding: 12 }}>
            {result}
          </pre>
        ) : null}

        <p>
          ← <a href="/read">/read に戻る</a>
        </p>
      </div>
    </main>
  );
}
