export interface PulseBannerProps {
  dateLabel: string;
  sentence: string;
  metaLabel?: string;
}

export function toSafeHtml(raw: string): string {
  const escaped = raw
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
  return escaped.replace(
    /\*([^*]+)\*/g,
    '<em style="font-weight:600;font-style:italic;">$1</em>',
  );
}

export function PulseBanner({ dateLabel, sentence, metaLabel }: PulseBannerProps) {
  return (
    <div
      style={{
        margin: "0 0 10px",
        background: "var(--accent-soft)",
        padding: "11px 15px 10px",
        borderRadius: 14,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 5,
        }}
      >
        <div
          style={{
            fontSize: "11px",
            fontWeight: 500,
            fontFamily: "var(--mono)", letterSpacing: "var(--tracking-label)",
            textTransform: "uppercase",
            color: "var(--accent-deep)",
            opacity: 0.75,
          }}
        >
          {dateLabel}
        </div>
        {metaLabel && (
          <div
            style={{
              fontSize: "11px",
              color: "var(--accent-deep)",
              opacity: 0.55,
              letterSpacing: "0.06em",
            }}
          >
            {metaLabel}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: "13px",
          fontStyle: "italic",
          lineHeight: 1.42,
          color: "var(--text)",
          letterSpacing: "-0.005em",
        }}
        dangerouslySetInnerHTML={{ __html: toSafeHtml(sentence) }}
      />
    </div>
  );
}
