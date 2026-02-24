
import "./globals.css";

export const metadata = {
  title: "Tarot Studio",
  description: "カードの声を、あなたの言葉に。",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body className="min-h-screen">{children}</body>
    </html>
  );
}