// app/layout.tsx
import "./globals.css";
import Link from "next/link";

export const metadata = {
  title: "Tarot Studio",
  description: "RWS専用・鑑定ジェネレーター",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen bg-black text-white">
        <header className="border-b border-white/10">
          <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-4 py-4">
            <div>
              <div className="text-lg font-semibold">Tarot Studio</div>
              <div className="text-sm text-white/70">RWS専用・鑑定ジェネレーター</div>
            </div>
            <nav className="flex items-center gap-2">
              <Link
                href="/new"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:border-white/25"
              >
                ＋ 新規鑑定
              </Link>
              <Link
                href="/read"
                className="rounded-xl border border-white/15 bg-white/5 px-3 py-2 text-sm hover:border-white/25"
              >
                履歴
              </Link>
            </nav>
          </div>
        </header>

        <main>{children}</main>
      </body>
    </html>
  );
}