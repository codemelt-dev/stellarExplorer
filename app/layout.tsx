import type { Metadata } from "next";
import { Instrument_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { Header } from "@/components/layout/Header";
import { LegendFlyout } from "@/components/layout/LegendFlyout";
import { AmbientBackground } from "@/components/layout/AmbientBackground";
import { cn } from "@/lib/utils";

const instrumentSans = Instrument_Sans({
  variable: "--font-ui",
  subsets: ["latin"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-data",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Stellar Explorer",
  description:
    "A live, human-readable explorer for the Stellar network. Decoded by default, raw on demand.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "h-full antialiased font-sans",
        instrumentSans.variable,
        jetbrainsMono.variable,
      )}
    >
      <body className="min-h-full flex flex-col">
        <AmbientBackground />
        <Providers>
          <Header />
          <main className="mx-auto w-full max-w-300 flex-1 px-4 py-6 sm:px-6">
            {children}
          </main>
          <LegendFlyout />
        </Providers>
      </body>
    </html>
  );
}
