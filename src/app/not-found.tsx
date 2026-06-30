import Link from "next/link";
import { VolnarLogo } from "@/components/VolnarLogo";

export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center text-center px-6 py-16">
      <VolnarLogo size={40} />
      <h1
        className="font-display font-medium text-hero tracking-[-0.02em] mt-7 mb-2"
        style={{ fontSize: "clamp(30px,6vw,44px)", fontVariationSettings: "'opsz' 48" }}
      >
        Nothing here.
      </h1>
      <p className="font-display italic text-dim mb-9" style={{ fontSize: 16, lineHeight: 1.5 }}>
        This page doesn&apos;t exist — or it moved somewhere quieter.
      </p>
      <Link
        href="/"
        className="inline-flex items-center justify-center gap-2 text-sm font-medium text-fg transition-colors hover:bg-surface"
        style={{
          padding: "12px 22px",
          minHeight: 44,
          border: "1px solid var(--border-strong)",
          borderRadius: "var(--radius-md)",
          textDecoration: "none",
        }}
      >
        Back to Volnar
      </Link>
    </div>
  );
}
