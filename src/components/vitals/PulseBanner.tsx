export interface PulseBannerProps {
  dateLabel: string;
  sentence: string;
  metaLabel?: string;
}

function toSafeHtml(raw: string): string {
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
        margin: "0 -17px 14px",
        background: "var(--accent-soft)",
        padding: "15px 18px 13px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "baseline",
          marginBottom: 7,
        }}
      >
        <div
          style={{
            fontSize: "9.5px",
            fontWeight: 500,
            letterSpacing: "0.18em",
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
              fontSize: "9.5px",
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
          fontSize: "15px",
          fontStyle: "italic",
          lineHeight: 1.5,
          color: "var(--text)",
          letterSpacing: "-0.005em",
        }}
        dangerouslySetInnerHTML={{ __html: toSafeHtml(sentence) }}
      />
    </div>
  );
}
