"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// Icons are from docs/redesign_mockups/portfolio.html — 256-unit viewBox.
// Portfolio uses fill when active (filled donut slice); others are always stroked.

function PortfolioIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 256 256" fill="currentColor" className="w-[24px] h-[24px]">
        <path d="M128,24A104,104,0,1,0,232,128,104.12,104.12,0,0,0,128,24Zm0,192a88,88,0,0,1-88-88,88.1,88.1,0,0,1,80-87.63V128a8,8,0,0,0,2.34,5.66l62.25,62.24A87.71,87.71,0,0,1,128,216Zm67.89-31.4L136,124.69V40.37A88.13,88.13,0,0,1,215.63,120,87.62,87.62,0,0,1,195.89,184.6Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
      <circle cx="128" cy="128" r="104" />
      <polyline points="128 128 128 40" />
      <polyline points="128 128 195.89 184.6" />
    </svg>
  );
}

function VitalsIcon({ active }: { active: boolean }) {
  if (active) {
    return (
      <svg viewBox="0 0 24 24" fill="currentColor" style={{ width: 21, height: 21 }}>
        <path d="M2 12 L6.5 12 L8.8 7 L13.2 18.5 L16 12 L22 12 L22 13 L16.5 13 L13.4 20.5 L9 9.5 L7 13 L2 13 Z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" style={{ width: 21, height: 21 }}>
      <path d="M2 12 L6.5 12 L8.8 7 L13.2 18.5 L16 12 L22 12" />
    </svg>
  );
}

const STATIC_TABS = [
  {
    label: "Portfolio",
    href: "/",
    icon: null,
  },
  {
    label: "Vitals",
    href: "/vitals",
    icon: null, // rendered via VitalsIcon
  },
  {
    label: "Chat",
    href: "/chat",
    icon: null, // rendered as elevated ring — see render loop below
  },
  {
    label: "Diary",
    href: "/diary",
    icon: (
      <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
        <path d="M128,88a31.79,31.79,0,0,1,24-24h78a2,2,0,0,1,2,2V194.86a2,2,0,0,1-2.4,2A40,40,0,0,0,224,196H160a32,32,0,0,0-32,32" />
        <path d="M26,196.83V65.91a2,2,0,0,1,2-2h76a32,32,0,0,1,24,24V228a32,32,0,0,0-32-32H32A6,6,0,0,1,26,196.83Z" />
      </svg>
    ),
  },
  {
    label: "Profile",
    href: "/profile",
    icon: (
      <svg viewBox="0 0 256 256" fill="none" stroke="currentColor" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" className="w-[24px] h-[24px]">
        <circle cx="128" cy="96" r="64" />
        <path d="M30.99,224a112.04,112.04,0,0,1,194.02,0" />
      </svg>
    ),
  },
] as const;

export function BottomNav() {
  const pathname = usePathname();

  if (pathname === "/login" || pathname.startsWith("/marketing")) return null;

  const assetIdMatch = pathname.match(/^\/asset\/([^/]+)$/);
  const chatHref = assetIdMatch ? `/chat?seed=asset&key=${assetIdMatch[1]}` : "/chat";

  return (
    <nav
      className="md:hidden fixed bottom-0 inset-x-0 z-30 border-t border-border"
      style={{
        background: "var(--nav-surface)",
        backdropFilter: "saturate(180%) blur(20px)",
        WebkitBackdropFilter: "saturate(180%) blur(20px)",
        // Clear the iOS home indicator (0 on web). Applied on the fixed nav
        // itself so the inset reaches the bottom edge.
        paddingBottom: "env(safe-area-inset-bottom, 0px)",
      }}
    >
      <div className="flex items-center h-16">
        {STATIC_TABS.map(({ label, href, icon }) => {
          const resolvedHref = label === "Chat" ? chatHref : href;
          const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
          const isChat = label === "Chat";

          let iconEl: React.ReactNode;
          if (label === "Portfolio") {
            iconEl = <PortfolioIcon active={active} />;
          } else if (label === "Chat") {
            iconEl = (
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: "50%",
                  border: "1.5px solid var(--accent)",
                  background: "rgba(74,124,94,0.07)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {active ? (
                  <svg
                    viewBox="0 0 256 256"
                    fill="currentColor"
                    style={{ width: 18, height: 18, color: "var(--accent)" }}
                  >
                    <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 256 256"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="10"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    style={{ width: 18, height: 18, color: "var(--text-faint)" }}
                  >
                    <path d="M232,128A104,104,0,0,1,79.12,219.82L45.07,231.17a16,16,0,0,1-20.24-20.24l11.35-34.05A104,104,0,1,1,232,128Z" />
                  </svg>
                )}
              </div>
            );
          } else if (label === "Vitals") {
            iconEl = <VitalsIcon active={active} />;
          } else {
            iconEl = icon;
          }

          return (
            <Link
              key={href}
              href={resolvedHref}
              className="flex flex-col items-center justify-center gap-1 h-full"
              style={{
                flex: isChat ? 1.05 : 1,
                color: active ? "var(--accent)" : "var(--text-faint)",
              }}
            >
              {iconEl}
              <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.02em" }}>
                {label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
