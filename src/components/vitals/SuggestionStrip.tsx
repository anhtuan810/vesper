import type { ReactNode } from "react";

type SuggestionVariant = "context" | "warn" | "alert";

export interface SuggestionStripProps {
  variant: SuggestionVariant;
  label: string;
  body: ReactNode;
  icon?: ReactNode;
}

const VARIANT_STYLES: Record<SuggestionVariant, { bg: string; color: string }> = {
  context: { bg: "var(--accent-soft)",   color: "var(--accent-deep)"   },
  warn:    { bg: "var(--amber-soft)",    color: "var(--amber-deep)"    },
  alert:   { bg: "var(--negative-soft)", color: "var(--negative-deep)" },
};

function InfoCircleIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }}
    >
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

function BulbIcon({ color }: { color: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      style={{ width: 13, height: 13, flexShrink: 0, marginTop: 2 }}
    >
      <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z" />
    </svg>
  );
}

export function SuggestionStrip({ variant, label, body, icon }: SuggestionStripProps) {
  const { bg, color } = VARIANT_STYLES[variant];
  const defaultIcon =
    variant === "context" ? <InfoCircleIcon color={color} /> : <BulbIcon color={color} />;

  return (
    <div
      style={{
        borderRadius: 9,
        padding: "9px 11px",
        marginTop: 10,
        display: "flex",
        gap: 8,
        alignItems: "flex-start",
        background: bg,
      }}
    >
      {icon ?? defaultIcon}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: "8.5px",
            fontWeight: 600,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            opacity: 0.82,
            marginBottom: 3,
            lineHeight: 1,
            color,
          }}
        >
          {label}
        </div>
        <div style={{ fontSize: "11.5px", lineHeight: 1.42, color: "var(--text)" }}>
          {body}
        </div>
      </div>
    </div>
  );
}
