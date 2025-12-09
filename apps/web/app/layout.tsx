import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
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
  title: "MinhaAgenda AI · Dashboard",
  description: "Plataforma inteligente de agendamentos e CRM para salões.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={`${geistSans.variable} ${geistMono.variable} min-h-screen antialiased`}>
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} disableTransitionOnChange>
          <div className="min-h-screen bg-background text-foreground selection:bg-primary/20 selection:text-foreground">
            <div className="bg-[radial-gradient(circle_at_20%_20%,hsl(var(--primary)_/_0.08),transparent_32%),radial-gradient(circle_at_80%_0%,hsl(var(--secondary)_/_0.12),transparent_28%),radial-gradient(circle_at_40%_80%,hsl(var(--primary)_/_0.06),transparent_32%)]">
              {children}
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
