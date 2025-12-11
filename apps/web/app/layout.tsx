import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
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
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
          <Toaster richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
