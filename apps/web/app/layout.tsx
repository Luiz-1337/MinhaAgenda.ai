import type { Metadata } from "next";
import { Geist_Mono, Outfit, Fraunces } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { LoadingProvider } from "@/contexts/loading-context";
import { LoadingOverlay } from "@/components/ui/loading-overlay";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

const outfit = Outfit({
  variable: "--font-outfit",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "900"],
  style: ["normal", "italic"],
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
      <body className={`${outfit.variable} ${fraunces.variable} ${geistMono.variable}`}>
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
