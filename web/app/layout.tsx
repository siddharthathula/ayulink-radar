import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource/noto-sans-telugu/400.css";
import "@fontsource/noto-sans-telugu/600.css";
import "@fontsource/noto-sans-devanagari/400.css";
import "@fontsource/noto-sans-devanagari/600.css";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { THEME_BOOT_SCRIPT } from "@/lib/ui/themeBoot";

export const metadata: Metadata = {
  metadataBase: new URL("https://ayulink-radar.vercel.app"),
  title: {
    default: "AyuLink Radar — AI early warning that knows your normal",
    template: "%s — AyuLink Radar",
  },
  description:
    "AI-powered early warning for everyone: a modular wristband learns each person's normal, spots neighbourhood clusters, forecasts which area flares up in 3 days, and tells health workers who to visit first. Works offline over LoRa. Screening prototype, not a medical device.",
  openGraph: {
    title: "AyuLink Radar — it knows your normal, and when your street isn't",
    description:
      "AI early warning: personal baselines, neighbourhood cluster alerts, a 3-day escalation forecast and a grounded assistant. Modular band, works offline.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#1B5E3A" },
    { media: "(prefers-color-scheme: dark)", color: "#0A2A1B" },
  ],
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased" data-theme="light" suppressHydrationWarning>
      <head>
        <meta name="color-scheme" content="light dark" />
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="flex min-h-full flex-col bg-bg text-text">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[1000] focus:rounded-lg focus:bg-brand focus:px-4 focus:py-2 focus:text-white"
        >
          Skip to content
        </a>
        <SiteHeader />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
