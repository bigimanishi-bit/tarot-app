// lib/dailyCards.ts
// ✅ 日替わり固定（JST）× ユーザー固定 の 3枚カード（朝/昼/夜）を生成する
// ✅ 完全ランダム（重複なし）だが、seedが同じなら毎回同じ結果
// ✅ 保存は localStorage（まずはBだけ）

export type DayPart = "morning" | "noon" | "night";

export type DailyCards = {
  dateJst: string; // YYYY-MM-DD (Asia/Tokyo)
  userId: string;
  cards: [string, string, string]; // [morning, noon, night]
  createdAt: number; // ms
};

function jstDateString(d = new Date()): string {
  // 例: "2026-02-26"
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  return fmt.format(d);
}

// 文字列→32bitハッシュ
function hash32(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// seeded PRNG: mulberry32
function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ✅ RWS基準 78枚のID（画像パスや表示名のキーに使う想定）
// ここは “カード名をそのままキー化” してる。後で画像マッピングしやすい。
export const RWS_78: string[] = [
  // Major 22
  "The Fool",
  "The Magician",
  "The High Priestess",
  "The Empress",
  "The Emperor",
  "The Hierophant",
  "The Lovers",
  "The Chariot",
  "Strength",
  "The Hermit",
  "Wheel of Fortune",
  "Justice",
  "The Hanged Man",
  "Death",
  "Temperance",
  "The Devil",
  "The Tower",
  "The Star",
  "The Moon",
  "The Sun",
  "Judgement",
  "The World",
  // Wands 14
  "Ace of Wands",
  "Two of Wands",
  "Three of Wands",
  "Four of Wands",
  "Five of Wands",
  "Six of Wands",
  "Seven of Wands",
  "Eight of Wands",
  "Nine of Wands",
  "Ten of Wands",
  "Page of Wands",
  "Knight of Wands",
  "Queen of Wands",
  "King of Wands",
  // Cups 14
  "Ace of Cups",
  "Two of Cups",
  "Three of Cups",
  "Four of Cups",
  "Five of Cups",
  "Six of Cups",
  "Seven of Cups",
  "Eight of Cups",
  "Nine of Cups",
  "Ten of Cups",
  "Page of Cups",
  "Knight of Cups",
  "Queen of Cups",
  "King of Cups",
  // Swords 14
  "Ace of Swords",
  "Two of Swords",
  "Three of Swords",
  "Four of Swords",
  "Five of Swords",
  "Six of Swords",
  "Seven of Swords",
  "Eight of Swords",
  "Nine of Swords",
  "Ten of Swords",
  "Page of Swords",
  "Knight of Swords",
  "Queen of Swords",
  "King of Swords",
  // Pentacles 14
  "Ace of Pentacles",
  "Two of Pentacles",
  "Three of Pentacles",
  "Four of Pentacles",
  "Five of Pentacles",
  "Six of Pentacles",
  "Seven of Pentacles",
  "Eight of Pentacles",
  "Nine of Pentacles",
  "Ten of Pentacles",
  "Page of Pentacles",
  "Knight of Pentacles",
  "Queen of Pentacles",
  "King of Pentacles",
];

function pick3Unique(seedStr: string): [number, number, number] {
  const rand = mulberry32(hash32(seedStr));
  const n = RWS_78.length;

  const picked = new Set<number>();
  while (picked.size < 3) {
    const i = Math.floor(rand() * n);
    picked.add(i);
  }
  const arr = Array.from(picked);
  return [arr[0], arr[1], arr[2]];
}

function storageKey(dateJst: string, userId: string) {
  return `ts_daily_cards_v1:${dateJst}:${userId}`;
}

export function getOrCreateDailyCards(userId: string, now = new Date()): DailyCards {
  const dateJst = jstDateString(now);

  // SSR回避
  if (typeof window === "undefined") {
    // サーバー側では作らない（Welcomeはclientで使う想定）
    return {
      dateJst,
      userId,
      cards: ["The Fool", "The Fool", "The Fool"],
      createdAt: Date.now(),
    };
  }

  const key = storageKey(dateJst, userId);
  try {
    const raw = localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw) as DailyCards;
      if (v?.dateJst === dateJst && v?.userId === userId && Array.isArray(v.cards) && v.cards.length === 3) {
        return v;
      }
    }
  } catch {
    // ignore
  }

  const seedStr = `${dateJst}|${userId}|RWS78|daily3`;
  const [a, b, c] = pick3Unique(seedStr);

  const created: DailyCards = {
    dateJst,
    userId,
    cards: [RWS_78[a], RWS_78[b], RWS_78[c]],
    createdAt: Date.now(),
  };

  try {
    localStorage.setItem(key, JSON.stringify(created));
  } catch {
    // ignore
  }

  return created;
}

export function clearTodayDailyCards(userId: string, now = new Date()) {
  if (typeof window === "undefined") return;
  const dateJst = jstDateString(now);
  try {
    localStorage.removeItem(storageKey(dateJst, userId));
  } catch {}
}

export function dayPartLabel(p: DayPart) {
  return p === "morning" ? "朝" : p === "noon" ? "昼" : "夜";
}