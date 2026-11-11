import type { Metadata, Viewport } from "next";
import { IBM_Plex_Sans_KR } from "next/font/google";
import Sidebar from "@/components/Sidebar";
import "./globals.css";

const plex = IBM_Plex_Sans_KR({
  variable: "--font-plex",
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "모델 설명 리포트",
  description: "학습된 분류 모델의 예측 근거를 SHAP 기여도 기반 자연어 리포트로 보여줍니다.",
};

export const viewport: Viewport = {
  themeColor: "#ffffff",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={plex.variable}>
      <body>
        <a href="#main" className="skipLink">
          본문으로 건너뛰기
        </a>
        <div className="shell">
          <Sidebar />
          <div className="content" id="main" tabIndex={-1}>
            {children}
          </div>
        </div>
      </body>
    </html>
  );
}
