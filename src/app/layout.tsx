import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AI PM Agent — 产品经理智能工作台",
  description: "AI 产品经理专业工作台，覆盖产品决策全链路的智能助手",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-CN" className="h-full antialiased">
      <body className="h-full">{children}</body>
    </html>
  );
}
