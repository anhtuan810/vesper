import { VolnarLogo } from "@/components/VolnarLogo";

type LogoProps = { size?: number; className?: string };

export function LogoMark({ size = 24, className }: LogoProps) {
  return <VolnarLogo size={size} className={className} />;
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <div
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: `${size * 0.4}px` }}
    >
      {/* The visible wordmark below already announces the brand name, so the
          mark's own aria-label would make screen readers say "Volnar" twice. */}
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        <LogoMark size={size} />
      </span>
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontWeight: 600,
          fontSize: `${size * 0.85}px`,
          letterSpacing: "var(--tracking-wordmark)",
          lineHeight: 1,
          color: "var(--text)",
        }}
      >
        Volnar
      </span>
    </div>
  );
}
