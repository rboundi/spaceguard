import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { Providers } from "@/components/layout/Providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: {
    default: "SpaceGuard",
    template: "%s | SpaceGuard",
  },
  description:
    "Cybersecurity compliance platform for European space operators",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${inter.className} bg-slate-950 text-slate-50 antialiased`}
      >
        <Providers>
          <div className="flex h-screen overflow-hidden">
            {/* Sidebar */}
            <Sidebar />

            {/* Main content with header */}
            <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
              <Header />
              <main className="flex-1 overflow-auto min-w-0">
                {children}
              </main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
