import type { Metadata } from "next";
import { Geist_Mono, Lexend_Deca } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { LoadingProvider } from "@/contexts/loading-context";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const lexendDeca = Lexend_Deca({
  variable: "--font-lexend-deca",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700"],
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
      <body className={`${lexendDeca.variable} ${geistMono.variable}`}>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <LoadingProvider>
            {children}
            <LoadingOverlay />
            <Toaster richColors />
          </LoadingProvider>
        </ThemeProvider>
        <SpeedInsights />
      </body>
    </html>
  );
}
