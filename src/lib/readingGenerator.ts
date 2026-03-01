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
type LengthPreset = "short" | "normal" | "deep";

type GenerateInput = {
  theme: string;
  title?: string;
  mode: "normal" | "dictionary";
  cards_text: string;
  deck_key?: string;
  spread_key?: string;
  tone?: ToneKey | string;
  length_preset?: LengthPreset;
};

const EXTRA_MARK = "---\n[鑑定に使う追加情報]";

function splitCardsAndExtra(raw: string) {
  const s = (raw ?? "").trim();
  if (!s) return { cardsPart: "", extraPart: "" };

  const idx = s.indexOf(EXTRA_MARK);
  if (idx === -1) return { cardsPart: s, extraPart: "" };

  const cardsPart = s.slice(0, idx).trim();
  const extraPart = s.slice(idx).trim();
  return { cardsPart, extraPart };
}

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
    const normalized = s.replace(
      /(^|\s)([0-9]{1,2})(?=\s|$)/g,
      (all, p1, num) => {
        const name = MAJOR_MAP[num];
        return name ? `${p1}${name}` : all;
      }
    );
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
    return {
      spread: "3cards_default",
      normalized: `現状：${tokens[0]}\n課題：${tokens[1]}\n助言：${tokens[2]}`,
    };
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

// 通常鑑定ではカード名を出さない前提だが、万一混ざったら軽く伏せる（保険）
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
  if (tone === "warm") return "口調はやわらかく、責めずに事実をほどく。";
  if (tone === "neutral") return "口調は落ち着いて中立。熱を上げすぎない。";
  if (tone === "direct") return "口調ははっきり。短く言い切ってから理由を添える。";
  return "口調は自然で落ち着いて。";
}

function needsSilenceScenarios(inputText: string) {
  const s = inputText ?? "";
  return /(既読|未読|返信|返事|反応|留守電|電話|連絡|音沙汰)/.test(s);
}

function lengthSpec(preset?: LengthPreset) {
  const p: LengthPreset = preset ?? "short";

  // ✅ 尻切れ防止：max_tokensを大きく上げる
  if (p === "deep") {
    return {
      preset: p,
      maxTokens: 1600,
      lengthLine: "全体は900〜1500字（最後の締め1行まで必ず到達）。",
      paragraphLines: [
        "続けて4段落（各2〜4文、見出しラベル禁止）：",
        "段落1=状況の整理（Aの具体＋Bの情報を混ぜて整理）",
        "段落2=相手/環境の動き（可能性3つ＋主仮説）",
        "段落3=あなた側で一番削れているポイント（Aの言い回しで具体に）",
        "段落4=この先の見通し（2パターンまで）",
      ],
      extraDeepRule:
        "【深掘り必須】本文内で必ず3点を書く：①不安の芯（何が分からなくて苦しいかを1つ）②いちばん困っている場面（既読/留守電/調停などの具体）③削れるループ（待つ→想像→悪化 を具体語で）。",
    };
  }

  if (p === "normal") {
    return {
      preset: p,
      maxTokens: 1050,
      lengthLine: "全体は520〜950字（最後の締め1行まで必ず到達）。",
      paragraphLines: [
        "続けて4段落（各2〜4文、見出しラベル禁止）：",
        "段落1=状況の整理（Aの具体＋Bの情報を混ぜて整理）",
        "段落2=相手/環境の動き（可能性3つ＋主仮説）",
        "段落3=あなた側で一番削れているポイント（Aの言い回しで具体に）",
        "段落4=この先の見通し（2パターンまで）",
      ],
      extraDeepRule: "",
    };
  }

  return {
    preset: p,
    maxTokens: 700,
    lengthLine: "全体は320〜620字（最後の締め1行まで必ず到達）。",
    paragraphLines: [
      "続けて4段落（各2〜4文、見出しラベル禁止）：",
      "段落1=状況の整理（Aの具体＋Bの情報を混ぜて整理）",
      "段落2=相手/環境の動き（可能性3つ＋主仮説）",
      "段落3=あなた側で一番削れているポイント（Aの言い回しで具体に）",
      "段落4=この先の見通し（2パターンまで）",
    ],
    extraDeepRule: "",
  };
}

export async function generateReadingText(input: GenerateInput) {
  const master = await getPromptByName("rws_master");

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is missing");

  const client = new OpenAI({ apiKey });

  const split = splitCardsAndExtra(input.cards_text);
  const parsed = normalizeCardsText(split.cardsPart);
  const wantScenarios = needsSilenceScenarios(parsed.normalized);

  const len = lengthSpec(input.length_preset);

  const normalHint = [
    "あなたはベテランタロット占い師。",
    "目的はカード説明ではなく、相談者の状況を“整理してわかる言葉”にして返すこと。",
    "",
    "【必須】質問で返さない（追加質問禁止。文末『？』も禁止）。",
    "【必須】タロットは相手の内心を直接断定する道具ではない。内心は断定せず『〜寄り』『〜の線が濃い』で述べる。",
    "【必須】断定予言しない（傾向/可能性の範囲）。",
    "【必須】本文でカード名を一切出さない（カード名ゼロ／略称ゼロ／番号列ゼロ）。",
    "",
    "【入力の扱い】A=相談文＋カード、B=---で囲われた[鑑定に使う追加情報]。必ずAとBの両方を読み、本文に反映する。",
    "【追加情報の使い方】生年月日/天気/月/過去要約は“説明”ではなく状況整理に溶かす。各要素は1点だけ短く使う。",
    "【数秘】Bに『【数秘】運命数（ライフパス）』があれば本文に必ず1回だけ触れる（1〜2文、決めつけ禁止、今回の苦しさの出方に接続）。",
    "",
    "【禁止語（強）】『心の整理』『自己理解』『見つめ直す』『前向き』『受け入れる』『モヤモヤ』『不安が続きそう』は禁止。必ず具体語に言い換える。",
    "【禁止】『可能性が考えられます』は禁止。可能性は段落2で“第一に…第二に…第三に…”の形で出す。",
    "【制限】『〜かもしれません』は合計2回まで。基本は『〜寄り』『〜になりやすい』『〜の線が濃い』で書く。",
    "説教や一般論で埋めない。Aの具体（別居/既読なし/留守電/調停など）を必ず使う。",
    "同じ意味の言い換えで水増ししない。",
    len.extraDeepRule ? len.extraDeepRule : "",
    "",
    "出力フォーマット（固定）",
    "冒頭は必ず3行。各1文。番号表記1)2)3)はOK。箇条書き記号（・-）は禁止。",
    "1) いま起きていること（Aの具体）",
    "2) いちばん詰まっている点（何が分からなくて苦しいか）",
    "3) この先の方向性（どうなりやすいか。断定しない）",
    "",
    ...len.paragraphLines,
    "",
    "段落2の書き方（固定）：第一に…第二に…第三に…の3つ → 最後に主仮説を1つだけ短く述べる（断定はしないが逃げない）。",
    wantScenarios
      ? "反応がない相談では、沈黙の理由を『怖さ／守り／外圧』のどれかに結びつけて具体化する。『忙しい』で逃げない。"
      : "",
    "最後は1行で締める：いま心が一番削れている一点を具体に言う（提案はしない）。",
    len.lengthLine,
    toneHint(input.tone),
  ]
    .filter(Boolean)
    .join("\n");

  const dictHint = [
    "あなたは📚辞書モード。",
    "辞書モードの時だけカード名の使用OK。",
    "質問で返さない（追加質問禁止。文末『？』も禁止）。",
    "カードごとに『核／出やすい現れ方／注意』を短く。",
    "最後に2〜3行だけ今回への当てはめ（A/Bに接続）。",
    "600〜1100字目安。",
    toneHint(input.tone),
  ].join("\n");

  const modeHint = input.mode === "dictionary" ? dictHint : normalHint;

  // userText：Bは“参考”じゃなく必須材料として渡す
  const userText = [
    `テーマ: ${input.theme}`,
    input.title ? `タイトル: ${input.title}` : "",
    input.tone ? `トーン: ${String(input.tone)}` : "",
    `モード: ${input.mode}`,
    `長さ: ${len.preset}`,
    `スプレッド: ${parsed.spread}`,
    "",
    "A) 相談文＋カード（ユーザー入力）:",
    parsed.normalized,
    split.extraPart ? "" : "",
    split.extraPart ? "\nB) [鑑定に使う追加情報]（必ず本文に反映）:" : "",
    split.extraPart ? split.extraPart : "",
  ]
    .filter(Boolean)
    .join("\n");

  const systemMaster =
    (master as any)?.content != null ? String((master as any).content) : String(master ?? "");
  const updatedAt = (master as any)?.updated_at ?? null;

  const res = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemMaster },
      { role: "system", content: modeHint },
      { role: "user", content: userText },
    ],
    temperature: input.mode === "dictionary" ? 0.65 : 0.55,
    max_tokens: input.mode === "dictionary" ? 1100 : len.maxTokens,
  });

  let text = res.choices?.[0]?.message?.content?.trim() ?? "";
  if (!text) throw new Error("empty generation");

  if (input.mode === "normal") text = stripCardNamesSafely(text);

  return { text, prompt_updated_at: updatedAt };
}