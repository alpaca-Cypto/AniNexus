import type { Metadata } from "next";
import "./globals.css";
import "./prism.css";
import "./site-shell.css";
import { LobeProvider } from "@/components/providers/LobeProvider";
import { APPLayout } from "./APPLayout";

export const metadata: Metadata = {
  title: "AniNexus — 个人动漫内容中枢",
  description: "发现、收藏并规划你的动画与漫画世界。",
  icons: {
    icon: [
      { url: "/favicon-32-1cf0fe78.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-64-1cf0fe78.png", sizes: "64x64", type: "image/png" },
      { url: "/Icon-1cf0fe78.png", sizes: "512x512", type: "image/png" },
    ],
    shortcut: "/favicon-32-1cf0fe78.png",
    apple: [{ url: "/apple-touch-icon-1cf0fe78.png", sizes: "180x180", type: "image/png" }],
  },
};
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // 关键：html 和 body 必须设为 h-full (height: 100%)
    <html lang="zh-CN" className="h-full" suppressHydrationWarning>
      <body className="antialiased h-full m-0 p-0 overflow-hidden">
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  const savedTheme = localStorage.getItem('theme');
                  if (savedTheme) {
                    document.documentElement.setAttribute('data-theme', savedTheme);
                  }
                } catch (e) {}
              })();
            `,
          }}
        />
        <LobeProvider>
          <APPLayout maxWidth="full" padding="lg" className="h-full">
            {children}
          </APPLayout>
        </LobeProvider>
      </body>
    </html>
  );
}
