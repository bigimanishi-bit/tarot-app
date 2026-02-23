// app/login/page.tsx
export const dynamic = "force-dynamic";

import LoginClient from "./LoginClient";

export default function LoginPage({
  searchParams,
}: {
  searchParams?: { reason?: string };
}) {
  const reason = searchParams?.reason ?? null;
  return <LoginClient reason={reason} />;
}