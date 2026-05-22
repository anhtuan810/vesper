export interface StatItem {
  label: string;
  value: string;
  negative?: boolean;
}

export interface StatStripProps {
  stats: StatItem[];
}

export function StatStrip({ stats }: StatStripProps) {
  const items = stats.slice(0, 4);

  return (
    <div
      style={{
        margin: "0 -17px 20px",
        display: "flex",
        padding: "0 17px 14px",
        borderBottom: "0.5px solid var(--border)",
      }}
    >
      {items.map((stat, i) => {
        const isFirst = i === 0;
        const isLast = i === items.length - 1;

        return (
          <div
            key={i}
            style={{
              flex: 1,
              paddingLeft: isFirst ? 0 : 10,
              paddingRight: isLast ? 0 : 10,
              borderRight: isLast ? undefined : "0.5px solid var(--border)",
            }}
          >
            <div
              style={{
                fontSize: "9px",
                color: "var(--text-faint)",
                letterSpacing: "0.11em",
                textTransform: "uppercase",
                lineHeight: 1,
                marginBottom: 5,
              }}
            >
              {stat.label}
            </div>
            <div
              style={{
                fontFamily: "var(--serif)",
                fontSize: "17px",
                fontWeight: 600,
                color: stat.negative ? "var(--negative)" : "var(--hero)",
                lineHeight: 1,
                fontFeatureSettings: "'tnum'",
              }}
            >
              {stat.value}
            </div>
          </div>
        );
      })}
    </div>
  );
}
