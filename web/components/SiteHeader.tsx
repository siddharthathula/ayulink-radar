"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Menu, Moon, Settings2, Sun, X } from "lucide-react";
import { SettingsPanel } from "./SettingsPanel";
import { useResolvedTheme, useSettings } from "@/lib/ui/settings";

function GithubMark({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 .7a11.3 11.3 0 0 0-3.57 22.03c.57.1.78-.25.78-.55v-2.1c-3.17.69-3.84-1.34-3.84-1.34-.52-1.32-1.27-1.67-1.27-1.67-1.04-.71.08-.7.08-.7 1.15.08 1.75 1.18 1.75 1.18 1.02 1.75 2.68 1.24 3.33.95.1-.74.4-1.24.72-1.53-2.53-.29-5.2-1.27-5.2-5.64 0-1.25.45-2.27 1.18-3.07-.12-.29-.51-1.45.11-3.02 0 0 .96-.31 3.14 1.17a10.9 10.9 0 0 1 5.72 0c2.18-1.48 3.14-1.17 3.14-1.17.62 1.57.23 2.73.11 3.02.74.8 1.18 1.82 1.18 3.07 0 4.38-2.67 5.35-5.21 5.63.41.36.78 1.05.78 2.12v3.14c0 .3.2.66.79.55A11.3 11.3 0 0 0 12 .7Z" />
    </svg>
  );
}

const NAV = [
  { href: "/demo", label: "Console" },
  { href: "/ai", label: "AI" },
  { href: "/configure", label: "Configure" },
  { href: "/field", label: "Field app" },
  { href: "/impact", label: "Impact" },
  { href: "/business", label: "Business" },
  { href: "/hardware", label: "Hardware" },
  { href: "/method", label: "Method" },
];

export function BrandMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true" className="shrink-0">
      <rect width="32" height="32" rx="9" fill="#ffffff" />
      <circle cx="16" cy="16" r="10" stroke="var(--green-700)" strokeWidth="1.6" opacity="0.35" />
      <circle cx="16" cy="16" r="5.5" stroke="var(--green-700)" strokeWidth="1.6" opacity="0.65" />
      <path
        d="M5 16.5h5.2l2-4.2 3.1 8.2 2.6-6.1 1.6 2.1H27"
        stroke="var(--pink-700)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [, updateSettings] = useSettings();
  const theme = useResolvedTheme();


  return (
    <header className="no-print sticky top-0 z-50 border-b border-black/20 bg-brandbar text-white">
      <div className="shell flex h-[var(--header-h)] items-center justify-between gap-6">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg py-1 no-underline" aria-label="AyuLink Radar home">
          <BrandMark />
          <span className="leading-none">
            <span className="block font-heading text-[17px] font-bold tracking-tight text-white">
              AyuLink Radar
            </span>
            <span className="mt-0.5 block text-[10.5px] font-medium tracking-wide text-onbrand">
              Community early-warning
            </span>
          </span>
        </Link>

        <nav aria-label="Primary" className="hidden items-center gap-1 lg:flex">
          {NAV.map((item) => {
            const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-9 items-center rounded-lg px-3 text-[13.5px] font-semibold no-underline transition-colors ${
                  active ? "bg-white text-[#1b5e3a]" : "text-onbrand hover:bg-white/10 hover:text-white"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="flex items-center gap-2">
          <Link
            href="/demo?tour=1"
            className="hidden h-9 items-center rounded-lg bg-white/10 px-3 text-[13px] font-semibold text-white no-underline ring-1 ring-white/25 transition-colors hover:bg-white/20 md:flex"
          >
            30-sec tour
          </Link>
          <button
            type="button"
            onClick={() => updateSettings({ theme: theme === "dark" ? "light" : "dark" })}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-onbrand transition-colors hover:bg-white/10 hover:text-white"
            aria-label={theme === "dark" ? "Switch to light theme" : "Switch to dark theme"}
            title={theme === "dark" ? "Light theme" : "Dark theme"}
          >
            {theme === "dark" ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-onbrand transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Open settings"
            title="Settings"
          >
            <Settings2 size={18} aria-hidden="true" />
          </button>
          <a
            href="https://github.com/siddharthathula/ayulink-radar"
            target="_blank"
            rel="noreferrer"
            className="hidden h-9 w-9 items-center justify-center rounded-lg text-onbrand transition-colors hover:bg-white/10 hover:text-white sm:flex"
            aria-label="GitHub repository"
          >
            <GithubMark size={18} />
          </a>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-white hover:bg-white/10 lg:hidden"
            aria-label={open ? "Close menu" : "Open menu"}
            aria-expanded={open}
            onClick={() => setOpen((value) => !value)}
          >
            {open ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
          </button>
        </div>
      </div>

      {open ? (
        <nav aria-label="Mobile" className="border-t border-white/10 bg-brandbar pb-3 lg:hidden">
          <div className="shell grid gap-1 pt-2">
            {NAV.map((item) => {
              const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  onClick={() => setOpen(false)}
                  className={`flex min-h-11 items-center rounded-lg px-3 text-[15px] font-semibold no-underline ${
                    active ? "bg-white text-[#1b5e3a]" : "text-onbrand hover:bg-white/10"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
            <Link
              href="/demo?tour=1"
              onClick={() => setOpen(false)}
              className="mt-1 flex min-h-11 items-center justify-center rounded-lg bg-white text-[15px] font-semibold text-[#1b5e3a] no-underline"
            >
              Run the 30-second tour
            </Link>
          </div>
        </nav>
      ) : null}
      {settingsOpen ? <SettingsPanel onClose={() => setSettingsOpen(false)} /> : null}
    </header>
  );
}
