// src/lib/readingGenerator.ts
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

type ToneKey = "warm" | "neutral" | "direct";

type GenerateInput = {
  theme: string;
  title?: string;
  mode: "normal" | "dictionary";
  cards_text: string;
  deck_key?: string;
  spread_key?: string;
  tone?: ToneKey | string;
};

function tokenToCardLabel(t: string) {
  const s = t.trim();
  const m = s.match(/^([0-9]{1,2})$/);
  if (m && MAJOR_MAP[m[1]] != null) return MAJOR_MAP[m[1]];
  return s;
}

function normalizeCardsText(raw: string) {
  const s = (raw ?? "").trim();
  if (!s) return { spread: "3cards_default", normalized: "現状：\n課題：\n助言：" };

  const hasRole =
    /現状\s*[:：]|課題\s*[:：]|助言\s*[:：]|相手\s*[:：]|本音\s*[:：]|障害\s*[:：]|打開\s*[:：]|近未来\s*[:：]|着地\s*[:：]|カード\s*[:：]|状況\s*[:：]/.test(
      s
    );

  if (hasRole) {
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

  if (tokens.length === 1) return { spread: "1card_default", normalized: `カード：${tokens[0]}` };
  if (tokens.length === 3)
    return { spread: "3cards_default", normalized: `現状：${tokens[0]}\n課題：${tokens[1]}\n助言：${tokens[2]}` };
  if (tokens.length === 5)
    return {
      spread: "5cards_default",
      normalized: `現状：${tokens[0]}\n相手（または環境）：${tokens[1]}\n本音：${tokens[2]}\n障害：${tokens[3]}\n打開：${tokens[4]}`,
    };
  if (tokens.length === 7)
    return {
      spread: "7cards_default",
      normalized: `現状：${tokens[0]}\n相手（または環境）：${tokens[1]}\n本音：${tokens[2]}\n障害：${tokens[3]}\n打開：${tokens[4]}\n近未来：${tokens[5]}\n着地：${tokens[6]}`,
    };

  return { spread: "list", normalized: `並び：${tokens.join(" / ")}` };
}

function stripCardNamesSafely(text: string) {
  if (!text) return text;

  const majors = [
    "愚者","魔術師","女教皇","女帝","皇帝","教皇","恋人","戦車","力","隠者","運命の輪","正義",
    "吊るされた男","死神","節制","悪魔","塔","星","月","太陽","審判","世界"
  ];

  const boundary = (w: string) =>
    new RegExp(`(?<![一-龠ぁ-んァ-ン])${w}(?![一-龠ぁ-んァ-ン])`, "g");

  let out = text;
  for (const w of majors) out = out.replace(boundary(w), "（伏せ）");

  out = out.replace(
    /(?<![一-龠ぁ-んァ-ン])([0-9０-９一二三四五六七八九十]+)\s*(ワンド|ソード|カップ|ペンタクル)(?![一-龠ぁ-んァ-ン])/g,
    "（伏せ）"
  );

  return out;
}

function toneHint(tone?: ToneKey | string) {
  if (tone === "warm") return "口調はやわらかく、短文で安心感を優先。";
  if (tone === "neutral") return "口調は落ち着いて整理。";
  if (tone === "direct")
    return "口調ははっきり。短文中心。『かもしれません』連発は禁止（最大2回）。";
  return "口調は自然で落ち着いて。";
}

function needsSilenceScenarios(inputText: string) {
  const s = inputText ?? "";
  return /(既読|未読|返信|返事|反応|留守電|電話|連絡|音沙汰)/.test(s);
}

export async function generateReadingText(input: GenerateInput) {
  const master = await getPromptByName("rws_master");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const client = new OpenAI({ apiKey });
  const parsed = normalizeCardsText(input.cards_text);
  const wantScenarios = needsSilenceScenarios(parsed.normalized);

  const normalHint = [
    "あなたは通常鑑定モード。",
    "本文でカード名を一切出さない（カード名ゼロ）。番号列も出さない。",
    "入力にある具体（既読/留守電など）を必ず使う。一般論で埋めない。",
    "テンプレ語（心の整理/自己理解/見つめ直す）は禁止。具体語に言い換える。",
    "見出し語・ラベルは禁止（例：事実/解釈/見通し/焦点/状況の整理 等）。",
    "同じ意味の言い換えで水増ししない。",
    "",
    "出力ルール（固定）",
    "冒頭は必ず3行。各1文。ラベルなし。箇条書き記号なし。",
    "1行目=今起きていること（具体）",
    "2行目=不安の焦点（何が分からなくて苦しいか）",
    "3行目=当面の見立て（どうなりやすいか）",
    "※3行は短く。各行25〜40字程度。",
    "",
    "その後は3段落：",
    "段落A=状況の見立て（2〜4文）",
    "段落B=相手/環境（断定しない、2〜4文）",
    "段落C=あなた側で一番削れているポイント（2〜4文）",
    "",
    wantScenarios
      ? "反応がない系の相談は、段落Bの中で相手側の可能性を3つ挙げる。『忙しい』の一言で逃げない（例：返すと話が進むのが怖い／読めない状態にして自分を守る／周囲や手続き都合で反応できない）。最後に主仮説を1つだけ述べる（断定はしないが逃げない）。"
      : "",
    "最後は1行で締める：いま心が一番削れている一点を具体に言う（提案はしない）。",
    "全体は300〜520字。",
    toneHint(input.tone),
  ]
    .filter(Boolean)
    .join("\n");

  const dictHint = [
    "あなたは📚辞書モード。",
    "カード名の使用OK。",
    "カードごとに『核／出やすい現れ方／注意』を短く。",
    "最後に2〜3行だけ、今回の状況に当てはめたまとめ。",
    "600〜1100字目安。",
    toneHint(input.tone),
  ].join("\n");

  const modeHint = input.mode === "dictionary" ? dictHint : normalHint;

  const userText = [
    `テーマ: ${input.theme}`,
    input.title ? `タイトル: ${input.title}` : "",
    input.tone ? `トーン: ${String(input.tone)}` : "",
    `モード: ${input.mode}`,
    `スプレッド: ${parsed.spread}`,
    `カード/入力:`,
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
    temperature: input.mode === "dictionary" ? 0.65 : 0.5,
    max_tokens: input.mode === "dictionary" ? 950 : 420,
  });

  let text = res.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("empty generation");

  if (input.mode === "normal") text = stripCardNamesSafely(text);

  return { text, prompt_updated_at: master.updated_at };
}