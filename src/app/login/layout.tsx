import { Metadata } from "next";

export const metadata: Metadata = { title: "Вход — ai-master" };

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
