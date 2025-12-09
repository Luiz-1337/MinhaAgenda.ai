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
  title: "MinhaAgenda AI - Gestão Inteligente",
  description:
    "Gestão inteligente de agendamentos, CRM e automações para negócios de beleza e bem-estar.",
  openGraph: {
    title: "MinhaAgenda AI - Gestão Inteligente",
    description:
      "Gestão inteligente de agendamentos, CRM e automações para negócios de beleza e bem-estar.",
    type: "website",
    locale: "pt_BR",
    siteName: "MinhaAgenda AI",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-slate-950 text-slate-50 antialiased selection:bg-cyan-500/30 selection:text-white`}
      >
        <div className="bg-[radial-gradient(circle_at_20%_20%,rgba(94,234,212,0.08),transparent_30%),radial-gradient(circle_at_80%_0%,rgba(129,140,248,0.18),transparent_28%),radial-gradient(circle_at_40%_80%,rgba(14,165,233,0.12),transparent_30%)]">
          {children}
        </div>
      </body>
    </html>
  );
}
