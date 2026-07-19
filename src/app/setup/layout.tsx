import { Metadata } from "next";

export const metadata: Metadata = { title: "Настройка — ai-master" };

export default function SetupLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
