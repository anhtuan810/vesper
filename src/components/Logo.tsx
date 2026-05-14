type LogoProps = { size?: number; className?: string };

export function LogoMark({ size = 24, className }: LogoProps) {
  const isSmall = size < 48;
  const width = size * (72 / 60);

  return (
    <svg
      width={width}
      height={size}
      viewBox="0 0 72 60"
      fill="none"
      className={className}
      style={{ color: "var(--text)" }}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M 4 4 L 16 4 L 36 50 L 56 4 L 68 4 L 42 56 L 30 56 Z"
      />
      <path
        fill="var(--accent)"
        d="M 20 4 L 30 4 L 36 28 L 42 4 L 52 4 L 41 36 L 31 36 Z"
      />
      {!isSmall && (
        <path
          fill="currentColor"
          d="M 32 4 L 36 4 L 36 14 L 40 4 L 44 4 L 38 18 L 34 18 Z"
        />
      )}
    </svg>
  );
}

export function Logo({ size = 24, className }: LogoProps) {
  return (
    <div
      className={className}
      style={{ display: "inline-flex", alignItems: "center", gap: `${size * 0.4}px` }}
    >
      <LogoMark size={size} />
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 600,
          fontSize: `${size * 0.85}px`,
          letterSpacing: "-0.04em",
          lineHeight: 1,
          color: "var(--text)",
        }}
      >
        Volnar
      </span>
    </div>
  );
}
