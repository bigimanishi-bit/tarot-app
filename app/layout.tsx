// app/layout.tsx
import "./globals.css";

export const metadata = {
  title: "Tarot Studio",
  description: "RWS専用・鑑定ジェネレーター",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      {/* ✅ 子ページ側が背景・UIを全部持ってるので、layoutは何も載せない */}
      <body className="min-h-screen text-white">{children}</body>
    </html>
  );
}