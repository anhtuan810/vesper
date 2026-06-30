"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";

export type DormantVital = {
  key: string;
  label: string;
  currentValue: string;
  surfacesWhen: string;
  reason?: 'applies' | 'property-off';
  icon?: ReactNode;
};

function DefaultIcon({ vitalKey }: { vitalKey: string }) {
  const s = { width: 14, height: 14 };
  const common = {
    fill: "none",
    stroke: "var(--text-faint)",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  switch (vitalKey) {
    case "income-coverage":
    case "income":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
        </svg>
      );
    case "currency-exposure":
    case "currency":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 3a14.5 14.5 0 0 1 0 18M3 12h18" />
        </svg>
      );
    case "age-cohort":
    case "age":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <circle cx="12" cy="12" r="9" />
          <polyline points="12 7 12 12 15 15" />
        </svg>
      );
    case "tax-drag":
    case "tax":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <line x1="19" y1="5" x2="5" y2="19" />
          <circle cx="6.5" cy="6.5" r="2.5" />
          <circle cx="17.5" cy="17.5" r="2.5" />
        </svg>
      );
    case "esg":
    case "sustainability":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <path d="M12 22s-8-4.5-8-11.8A8 8 0 0 1 12 2a8 8 0 0 1 8 8.2c0 7.3-8 11.8-8 11.8z" />
        </svg>
      );
    case "inflation-shield":
    case "inflation":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <path d="M12 22V12M12 12L7 7M12 12l5-5" />
          <path d="M3 12h3m12 0h3M12 3v3" />
        </svg>
      );
    case "correlation":
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <rect x="3" y="3" width="7" height="7" />
          <rect x="14" y="3" width="7" height="7" />
          <rect x="14" y="14" width="7" height="7" />
          <rect x="3" y="14" width="7" height="7" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 24 24" style={s} {...common}>
          <line x1="8" y1="6" x2="21" y2="6" />
          <line x1="8" y1="12" x2="21" y2="12" />
          <line x1="8" y1="18" x2="21" y2="18" />
          <line x1="3" y1="6" x2="3.01" y2="6" />
          <line x1="3" y1="12" x2="3.01" y2="12" />
          <line x1="3" y1="18" x2="3.01" y2="18" />
        </svg>
      );
  }
}

export function LibraryExpander({
  dormantVitals,
  totalCount = 11,
}: {
  dormantVitals: DormantVital[];
  totalCount?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const router = useRouter();

  function handleVitalTap(vitalKey: string) {
    sessionStorage.setItem("vitals.seed.vital", vitalKey);
    router.push(`/chat?seed=insight&key=vital-${vitalKey}`);
  }

  return (
    <div
      style={{
        background: "rgba(248,244,236,0.55)",
        border: "0.5px solid var(--border)",
        borderRadius: "var(--radius-md)",
        padding: "13px 14px",
        marginBottom: 18,
        cursor: "pointer",
      }}
      onClick={() => setExpanded((e) => !e)}
    >
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div>
          <div
            style={{ display: "flex", alignItems: "baseline", gap: 8 }}
          >
            <span style={{ fontSize: "var(--fs-body)", color: "var(--text)", fontWeight: 500, lineHeight: 1.2 }}>
              Library
            </span>
            <span style={{ fontSize: "var(--fs-caption)", color: "var(--text-faint)" }}>
              {totalCount} vitals · {dormantVitals.length} dormant
            </span>
          </div>
          <div
            style={{
              fontSize: "var(--fs-caption)",
              color: "var(--text-faint)",
              marginTop: 3,
            }}
          >
            Tap to explore what surfaces when conditions change
          </div>
        </div>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="var(--text-faint)"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{
            width: 14,
            height: 14,
            flexShrink: 0,
            transform: expanded ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.2s ease",
          }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </div>

      {/* Expanded rows */}
      {expanded && (
        <div style={{ marginTop: 8 }}>
          {dormantVitals.map((vital, i) => (
            <div
              key={vital.key}
              onClick={(e) => {
                e.stopPropagation();
                handleVitalTap(vital.key);
              }}
              style={{
                display: "flex",
                gap: 12,
                padding: "11px 0",
                borderBottom:
                  i < dormantVitals.length - 1
                    ? "0.5px solid var(--border)"
                    : "none",
                cursor: "pointer",
                alignItems: "flex-start",
              }}
            >
              {/* Icon */}
              <div
                style={{
                  width: 28,
                  height: 28,
                  borderRadius: "var(--radius-md)",
                  background: "var(--surface-elev)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  flexShrink: 0,
                }}
              >
                {vital.icon ?? <DefaultIcon vitalKey={vital.key} />}
              </div>
              {/* Content */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "baseline",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: "var(--fs-body)", fontFamily: "var(--font-ui)", fontWeight: 500, lineHeight: 1.2, color: "var(--text)" }}>
                    {vital.label}
                  </span>
                  <span
                    className="tnum"
                    style={{
                      fontSize: "var(--fs-caption)",
                      color: "var(--text-faint)",
                      flexShrink: 0,
                    }}
                  >
                    {vital.currentValue}
                  </span>
                </div>
                <div
                  style={{
                    fontSize: "var(--fs-caption)",
                    color: "var(--text-dim)",
                    lineHeight: "var(--lh-snug)",
                    marginTop: 2,
                  }}
                >
                  {vital.reason === "property-off"
                    ? "Hidden while Property is off"
                    : vital.surfacesWhen}
                </div>
              </div>
              {/* Trailing chevron */}
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text-faint)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                style={{
                  width: 13,
                  height: 13,
                  flexShrink: 0,
                  marginTop: 8,
                }}
              >
                <polyline points="9 18 15 12 9 6" />
              </svg>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
