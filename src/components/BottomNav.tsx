"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const STATIC_TABS = [
  {
    label: "Portfolio",
    href: "/",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <line x1="18" y1="20" x2="18" y2="10" />
        <line x1="12" y1="20" x2="12" y2="4" />
        <line x1="6" y1="20" x2="6" y2="14" />
      </svg>
    ),
  },
  {
    label: "Diary",
    href: "/diary",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
        <path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15Z" />
      </svg>
    ),
  },
  {
    label: "Chat",
    href: "/chat",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    label: "Profile",
    href: "/profile",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
        <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
        <circle cx="12" cy="7" r="4" />
      </svg>
    ),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login") return null;

  const assetIdMatch = pathname.match(/^\/asset\/([^/]+)$/);
  const chatHref = assetIdMatch ? `/chat?asset=${assetIdMatch[1]}` : "/chat";

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border"
      style={{
        background: "var(--nav-surface)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="flex items-center h-16">
        {STATIC_TABS.map(({ label, href, icon }) => {
          const resolvedHref = label === "Chat" ? chatHref : href;
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          return (
            <Link
              key={href}
              href={resolvedHref}
              className="flex flex-col items-center justify-center gap-1 flex-1 h-full"
              style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}
            >
              {icon}
              <span
                style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.02em" }}
              >
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
