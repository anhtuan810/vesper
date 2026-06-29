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
        borderRadius: "var(--radius-lg)",
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
          className="eyebrow"
          style={{
            color: "var(--accent-deep)",
            opacity: 0.75,
          }}
        >
          {dateLabel}
        </div>
        {metaLabel && (
          <div
            className="eyebrow"
            style={{
              color: "var(--accent-deep)",
              opacity: 0.55,
            }}
          >
            {metaLabel}
          </div>
        )}
      </div>
      <div
        style={{
          fontFamily: "var(--serif)",
          fontSize: "var(--fs-body)",
          fontStyle: "italic",
          lineHeight: "var(--lh-body)",
          color: "var(--text)",
        }}
        dangerouslySetInnerHTML={{ __html: toSafeHtml(sentence) }}
      />
    </div>
  );
}
