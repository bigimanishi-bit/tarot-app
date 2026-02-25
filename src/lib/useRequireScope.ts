// src/lib/useRequireScope.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isScopeReady, loadScope, type TarotScope } from "@/lib/scope";

type Options = {
  requireClient?: boolean;
};

export function useRequireScope(opts: Options = {}) {
  const router = useRouter();
  const pathname = usePathname();

  const [scope, setScope] = useState<TarotScope | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const s = loadScope();
    setScope(s);
    setReady(true);

    if (!isScopeReady(s)) {
      router.replace(`/welcome?reason=need_scope&next=${encodeURIComponent(pathname)}`);
      return;
    }

    if (opts.requireClient && s?.targetType === "client" && !s.clientProfileId) {
      router.replace(`/welcome?reason=need_client&next=${encodeURIComponent(pathname)}`);
      return;
    }
  }, [router, pathname, opts.requireClient]);

  const canRender = useMemo(() => {
    if (!ready) return false;
    if (!isScopeReady(scope)) return false;
    if (opts.requireClient && scope?.targetType === "client" && !scope.clientProfileId) return false;
    return true;
  }, [ready, scope, opts.requireClient]);

  return { scope, canRender };
}