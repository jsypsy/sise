import type { Metadata } from "next";
import Script from "next/script";
import Link from "next/link";
import { Gowun_Batang } from "next/font/google";
import "./globals.css";
import Nav from "./nav";
import { SITE_URL, SITE_NAME, SITE_DESCRIPTION, ADSENSE_CLIENT } from "@/lib/site";

const gowun = Gowun_Batang({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-gowun",
  display: "swap",
});

const DEFAULT_TITLE = "시세 — 아파트 실거래 시그널";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: DEFAULT_TITLE,
    template: "%s · 시세",
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    locale: "ko_KR",
    url: "/",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  twitter: {
    card: "summary_large_image",
    title: DEFAULT_TITLE,
    description: SITE_DESCRIPTION,
  },
  robots: { index: true, follow: true },
  verification: {
    google: "RVStMsSALhHJvRb6yvbbzef6egjo539sTPM_T8zS6iU",
    // AdSense 소유권 인증 — ADSENSE_CLIENT(ca-pub-…) 설정 시 SSR <head>에
    // <meta name="google-adsense-account">로 출력돼 심사 인증이 확실해진다.
    ...(ADSENSE_CLIENT ? { other: { "google-adsense-account": ADSENSE_CLIENT } } : {}),
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" className={gowun.variable}>
      <body className="bg-[var(--paper)] text-[var(--ink)] min-h-screen flex flex-col">
        <header className="border-b-[3px] border-double border-[var(--line-strong)] py-4">
          <div className="max-w-4xl mx-auto px-4 w-full">
            <Link href="/" className="inline-block hover:opacity-80 transition-opacity">
              <h1
                className="text-3xl font-bold tracking-tight"
                style={{ fontFamily: "var(--font-gowun), serif" }}
              >
                시세
              </h1>
              <p className="text-xs text-[var(--ink-soft)] mt-1 tracking-widest uppercase">
                아파트 매매 실거래 시그널
              </p>
            </Link>
          </div>
        </header>
        <Nav />
        <main className="flex-1 px-4 py-4 max-w-4xl mx-auto w-full">
          {children}
        </main>
        <footer className="border-t border-[var(--line)] py-3 text-xs text-[var(--ink-soft)]">
          <div className="max-w-4xl mx-auto px-4 w-full flex flex-wrap gap-x-3 gap-y-1">
            <Link href="/guide" className="hover:underline">가이드</Link>
            <Link href="/about" className="hover:underline">소개</Link>
            <Link href="/privacy" className="hover:underline">개인정보처리방침</Link>
            <Link href="/feedback" className="hover:underline">의견 보내기</Link>
          </div>
        </footer>

        {ADSENSE_CLIENT && (
          <Script
            async
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${ADSENSE_CLIENT}`}
            crossOrigin="anonymous"
            strategy="afterInteractive"
          />
        )}
      </body>
    </html>
  );
}
