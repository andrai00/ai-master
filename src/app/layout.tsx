import type { Metadata } from "next";
import Providers from "@/src/app-layer";
import "./globals.css";

export const metadata: Metadata = {
  title: "ai-master",
  description: "ИИ-мастер для настольных ролевых игр",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
