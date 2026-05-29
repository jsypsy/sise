import type { Metadata } from "next";
import "./globals.css";
import Nav from "./nav";

export const metadata: Metadata = {
  title: "시세 — 아파트 실거래 시그널",
  description: "국토부 실거래가 기반 매일 신고가·반등 시그널",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="bg-[var(--paper)] text-[var(--ink)] min-h-screen flex flex-col">
        <header className="border-b-[3px] border-double border-[var(--line-strong)] px-4 py-3">
          <h1 className="font-serif text-2xl font-bold tracking-tight">시세</h1>
          <p className="text-xs text-[var(--ink-soft)] mt-0.5">
            아파트 매매 실거래 시그널
          </p>
        </header>
        <Nav />
        <main className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full">
          {children}
        </main>
        <footer className="border-t border-[var(--line)] px-4 py-3 text-xs text-[var(--ink-soft)]">
          본 서비스는 국토교통부 실거래가 공개시스템 데이터를 가공한 것으로 정부 공식 서비스가 아니며,
          정보의 정확성·완전성을 보장하지 않습니다. 평형은 추정치이며 투자 판단의 책임은 이용자에게 있습니다.
        </footer>
      </body>
    </html>
  );
}
