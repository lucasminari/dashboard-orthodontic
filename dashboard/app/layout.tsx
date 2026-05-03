import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "./components/Navbar";
import { FiltrosProvider } from "./components/useFiltros";

export const dynamic = 'force-dynamic';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Dashboard Ortodôntico",
  description: "Sistema de gestão de importações de dados para clínica ortodôntica",
  manifest: "/manifest.json",
  themeColor: "#000000",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="pt-BR"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-full flex flex-col">
        <FiltrosProvider>
          <Navbar />
          {children}
        </FiltrosProvider>
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                let refreshing = false;
                navigator.serviceWorker.addEventListener('controllerchange', () => {
                  if (refreshing) return;
                  refreshing = true;
                  window.location.reload();
                });

                navigator.serviceWorker.register('/sw.js').then(reg => {
                  reg.update().catch(() => {});
                }).catch(err => {
                  console.warn('Service Worker registration failed:', err);
                });

                window.addEventListener('online', () => {
                  if (navigator.serviceWorker?.controller) {
                    navigator.serviceWorker.controller.postMessage({
                      type: 'RETRY_UPLOADS'
                    });
                  }
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
