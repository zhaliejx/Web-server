import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
// Old-Safari runtime polyfills — must be the first client module to load.
import "./polyfills";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Ajest — Anime, Unbound",
  description:
    "Premium anime streaming. Simulcast schedule with live countdowns, triple-tier catalog (AniList → Jikan → Consumet) and a triple-fallback HLS player.",
  keywords: ["Ajest", "anime", "streaming", "simulcast", "AniList", "Jikan", "HLS"],
  applicationName: "Ajest",
  manifest: "/manifest.json",
  icons: {
    icon: "/ajest-icon.svg",
    apple: "/ajest-icon.svg",
  },
  appleWebApp: {
    capable: true,
    title: "Ajest",
    statusBarStyle: "black-translucent",
  },
  formatDetection: {
    telephone: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d12",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-background text-foreground`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
