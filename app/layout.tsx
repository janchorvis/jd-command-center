import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Command Center",
  description: "Jacob's personal task & deal dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.className} bg-slate-900 text-white`}>
        <div className="min-h-screen flex flex-col">
          <nav className="bg-slate-800 border-b border-slate-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-16">
                <div className="flex items-center gap-8">
                  <h1 className="text-xl font-bold">⚡ Command Center</h1>
                  <div className="flex gap-4">
                    <Link href="/" className="text-slate-300 hover:text-white transition">
                      Home
                    </Link>
                    <Link href="/tasks" className="text-slate-300 hover:text-white transition">
                      Tasks
                    </Link>
                    <Link href="/deals" className="text-slate-300 hover:text-white transition">
                      Deals
                    </Link>
                  </div>
                </div>
              </div>
            </div>
          </nav>

          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
