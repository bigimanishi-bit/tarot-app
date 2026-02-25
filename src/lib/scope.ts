// lib/scope.ts
export type TarotTargetType = "self" | "client";

export type TarotScope = {
  targetType: TarotTargetType;
  clientProfileId: string | null;
  clientDisplayName: string | null;
  updatedAt: number;
};

const KEY = "tarot_scope_v1";

export function loadScope(): TarotScope | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<TarotScope> | null;

    if (!v) return null;

    const targetType = v.targetType === "client" ? "client" : v.targetType === "self" ? "self" : null;
    if (!targetType) return null;

    if (targetType === "self") {
      return {
        targetType: "self",
        clientProfileId: null,
        clientDisplayName: null,
        updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now(),
      };
    }

    return {
      targetType: "client",
      clientProfileId: typeof v.clientProfileId === "string" ? v.clientProfileId : null,
      clientDisplayName: typeof v.clientDisplayName === "string" ? v.clientDisplayName : null,
      updatedAt: typeof v.updatedAt === "number" ? v.updatedAt : Date.now(),
    };
  } catch {
    return null;
  }
}

export function saveScope(next: TarotScope) {
  if (typeof window === "undefined") return;

  const normalized: TarotScope =
    next.targetType === "self"
      ? { targetType: "self", clientProfileId: null, clientDisplayName: null, updatedAt: Date.now() }
      : {
          targetType: "client",
          clientProfileId: next.clientProfileId ?? null,
          clientDisplayName: next.clientDisplayName ?? null,
          updatedAt: Date.now(),
        };

  localStorage.setItem(KEY, JSON.stringify(normalized));
}

export function clearScope() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function isScopeReady(scope: TarotScope | null): boolean {
  if (!scope) return false;
  if (scope.targetType === "self") return true;
  return !!scope.clientProfileId;
}

export function scopeLabel(scope: TarotScope | null): string {
  if (!scope) return "未選択";
  if (scope.targetType === "self") return "自分をみる";
  return scope.clientDisplayName ? `カルテ：${scope.clientDisplayName}` : "カルテ";
}