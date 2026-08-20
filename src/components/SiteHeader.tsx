// src/components/SiteHeader.tsx
//
// The site header/nav, shared by the incident and check-lockfile pages.
// `active` picks which nav link renders as current; everything else is
// identical between pages.

import Link from "next/link";

const NAV_LINKS = [
  { href: "/incident", label: "Incident", key: "incident" },
  { href: "/check-lockfile", label: "Check lockfile", key: "check-lockfile" },
] as const;

type NavKey = (typeof NAV_LINKS)[number]["key"];

export default function SiteHeader({ active }: { active: NavKey }) {
  return (
    <header className="border-b border-hairline">
      <div className="mx-auto max-w-[1200px] px-8 py-6 flex items-center justify-between">
        <Link href="/" className="font-semibold tracking-tight">RADIUS</Link>
        <nav className="flex gap-6 text-sm text-muted">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.key}
              href={link.href}
              className={link.key === active ? "text-ink" : "hover:text-ink transition-colors"}
            >
              {link.label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
