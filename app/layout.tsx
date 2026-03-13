import type { Metadata } from "next";
import { Inter } from "next/font/google";
import Link from "next/link";
import "./globals.css";
import MobileNav from "@/components/MobileNav";

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
      <body className={`${inter.className} bg-slate-950 text-white`}>
        <div className="min-h-screen flex flex-col">
          <nav className="bg-slate-900 border-b border-slate-700">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-14">
                <div className="flex items-center gap-8">
                  <Link href="/" className="text-lg font-bold hover:opacity-80 transition">
                    ⚡ Command Center
                  </Link>
                  <div className="hidden md:flex gap-1">
                    <NavLink href="/">Home</NavLink>
                    <NavLink href="/deals">Deals</NavLink>
                    <NavLink href="/prep">Prep</NavLink>
                    <NavLink href="/tasks">Tasks</NavLink>
                  </div>
                </div>
                <MobileNav />
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

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="text-sm text-slate-400 hover:text-white hover:bg-slate-800 px-3 py-1.5 rounded-md transition"
    >
      {children}
    </Link>
  );
}
