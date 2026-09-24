import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "MoSe News",
  description: "어머님을 위한 맞춤형 투자 뉴스",
  icons: {
    icon: '/background.jpg', // 일반 브라우저 탭 아이콘
    apple: '/background.jpg', // 바탕화면 바로가기 아이콘 (iOS/안드로이드 공통 적용)
  },
  manifest: '/manifest.json', // (선택사항이나 확장을 위해)
  appleWebApp: {
    title: 'MoSe News',
    statusBarStyle: 'black-translucent',
    capable: true, // 브라우저 주소창을 없애고 진짜 앱처럼 전체화면으로 실행
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
