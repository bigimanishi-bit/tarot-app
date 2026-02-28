import OpenAI from "openai";
import { getPromptByName } from "@/lib/promptStore";

const MAJOR_MAP: Record<string, string> = {
  "0": "愚者",
  "1": "魔術師",
  "2": "女教皇",
  "3": "女帝",
  "4": "皇帝",
  "5": "教皇",
  "6": "恋人",
  "7": "戦車",
  "8": "力",
  "9": "隠者",
  "10": "運命の輪",
  "11": "正義",
  "12": "吊るされた男",
  "13": "死神",
  "14": "節制",
  "15": "悪魔",
  "16": "塔",
  "17": "星",
  "18": "月",
  "19": "太陽",
  "20": "審判",
  "21": "世界",
};

// 数字トークン → 大アルカナ名へ（内部用）
function tokenToCardLabel(t: string) {
  const s = t.trim();
  const m = s.match(/^([0-9]{1,2})$/);
  if (m && MAJOR_MAP[m[1]] != null) return MAJOR_MAP[m[1]];
  return s;
}

// 役割付き or トークン列を正規化
function normalizeCardsText(raw: string) {
  const s = (raw ?? "").trim();
  if (!s) {
    return { spread: "3cards_default", normalized: "現状：\n課題：\n助言：" };
  }

  const hasRole =
    /現状\s*[:：]|課題\s*[:：]|助言\s*[:：]|相手\s*[:：]|本音\s*[:：]|障害\s*[:：]|打開\s*[:：]|近未来\s*[:：]|着地\s*[:：]/.test(
      s
    );

  if (hasRole) {
    // 役割付きの場合も、数字だけなら内部変換して渡す
    const normalized = s.replace(/(^|\s)([0-9]{1,2})(?=\s|$)/g, (all, p1, num) => {
      const name = MAJOR_MAP[num];
      return name ? `${p1}${name}` : all;
    });
    return { spread: "role_based", normalized };
  }

  const tokens = s
    .replace(/[　]/g, " ")
    .replace(/\s+/g, " ")
    .split(" ")
    .map((t) => t.trim())
    .filter(Boolean)
    .map(tokenToCardLabel);

  if (tokens.length === 3) {
    return {
      spread: "3cards_default",
      normalized: `現状：${tokens[0]}\n課題：${tokens[1]}\n助言：${tokens[2]}`,
    };
  }
  if (tokens.length === 5) {
    return {
      spread: "5cards_default",
      normalized: `現状：${tokens[0]}\n相手（または環境）：${tokens[1]}\n本音：${tokens[2]}\n障害：${tokens[3]}\n打開：${tokens[4]}`,
    };
  }
  if (tokens.length === 7) {
    return {
      spread: "7cards_default",
      normalized: `現状：${tokens[0]}\n相手（または環境）：${tokens[1]}\n本音：${tokens[2]}\n障害：${tokens[3]}\n打開：${tokens[4]}\n近未来：${tokens[5]}\n着地：${tokens[6]}`,
    };
  }
  return { spread: "list", normalized: `並び：${tokens.join(" / ")}` };
}

// 「努力」の力など、単語内部は壊さないための境界付き置換
function stripCardNamesSafely(text: string) {
  if (!text) return text;

  const majors = [
    "愚者","魔術師","女教皇","女帝","皇帝","教皇","恋人","戦車","力","隠者","運命の輪","正義",
    "吊るされた男","死神","節制","悪魔","塔","星","月","太陽","審判","世界"
  ];

  // 前後が “日本語文字” じゃないときだけ置換（単語内は除外）
  const boundary = (w: string) =>
    new RegExp(`(?<![一-龠ぁ-んァ-ン])${w}(?![一-龠ぁ-んァ-ン])`, "g");

  let out = text;
  for (const w of majors) out = out.replace(boundary(w), "（伏せ）");

  // 小アルカナ表記も（単語内は起きにくいけど一応）
  out = out.replace(
    /(?<![一-龠ぁ-んァ-ン])([0-9０-９一二三四五六七八九十]+)\s*(ワンド|ソード|カップ|ペンタクル)(?![一-龠ぁ-んァ-ン])/g,
    "（伏せ）"
  );

  return out;
}

type ToneKey = "warm" | "neutral" | "direct";

type GenerateInput = {
  theme: string;
  title?: string;
  mode: "normal" | "dictionary";
  cards_text: string;

  // ✅ 任意（/new から渡す）
  deck_key?: string;
  spread_key?: string;
  tone?: ToneKey | string;
};

export async function generateReadingText(input: GenerateInput) {
  const master = await getPromptByName("rws_master");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const client = new OpenAI({ apiKey });
  const parsed = normalizeCardsText(input.cards_text);

  const toneHint =
    input.tone === "warm"
      ? "文体はやわらかく、余韻を残す。断定を避ける。"
      : input.tone === "neutral"
      ? "文体は落ち着いて整理する。断定は避け、可能性で述べる。"
      : input.tone === "direct"
      ? "文体ははっきり。余計な前置きは省く。ただし攻撃的にはしない。"
      : "文体は落ち着いて、占い師として自然に。";

  const modeHint =
    input.mode === "dictionary"
      ? [
          "あなたは📚辞書モード。",
          "カード名の使用OK。",
          "カードごとに「核／出やすい現れ方／注意」。",
          "最後に2〜3行だけ鑑定（まとめ＋一手＋確度）。",
          "長さは800〜1200字を目安（長すぎ禁止）。",
        ].join("\n")
      : [
          "あなたは通常鑑定モード。",
          "本文でカード名を一切出さない（カード名ゼロ）。",
          "番号列を使わない。",
          "見出し横の括弧（）を使わない。",
          "説教や一般論に逃げず、占いとして「流れ・山場・分岐・鍵」を語る。",
          "長さは550〜850字を目安（長すぎ禁止）。",
          "構成は必ず次の順で出す：",
          "1) いまの流れ（2〜3文）",
          "2) 山場（何が引っ掛かっているか）",
          "3) 分岐（こう動くとこうなる、の二股）",
          "4) 鍵（今ここだけ押さえる一点）",
          "5) 一手（名詞＋動詞で1行、低侵襲）",
          "6) 確度（高/中/低 を1行）",
          "質問で返さない（追加質問禁止）。",
          toneHint,
        ].join("\n");

  const userText = [
    `テーマ: ${input.theme}`,
    input.title ? `タイトル: ${input.title}` : "",
    input.deck_key ? `デッキ: ${input.deck_key}` : "",
    input.spread_key ? `スプレッドKey: ${input.spread_key}` : "",
    input.tone ? `トーン: ${String(input.tone)}` : "",
    `モード: ${input.mode}`,
    `スプレッド: ${parsed.spread}`,
    `カード:`,
    parsed.normalized,
  ]
    .filter(Boolean)
    .join("\n");

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: master.content },
      { role: "system", content: modeHint },
      { role: "user", content: userText },
    ],
    temperature: 0.7,
    max_tokens: input.mode === "dictionary" ? 900 : 700,
  });

  let text = res.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("empty generation");

  if (input.mode === "normal") {
    text = stripCardNamesSafely(text);
  }

  return { text, prompt_updated_at: master.updated_at };
}