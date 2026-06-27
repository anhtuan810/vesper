type Props = { size?: number; className?: string };

export function VolnarLogo({ size = 60, className }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 60 60"
      fill="none"
      role="img"
      aria-label="Volnar"
      className={className}
      style={{ color: "var(--accent-deep)" }}
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon points="4,8 16,8 30,46 44,8 56,8 33,54 27,54" fill="currentColor" />
      <polygon points="18,10 42,10 30,42" fill="#97703D" />
    </svg>
  );
}
