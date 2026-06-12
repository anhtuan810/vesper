interface FormatTextProps {
  text: string;
}

function formatInline(str: string) {
  // **bold** and *italic* — the alternation tries the double marker first so
  // a bold span is never consumed as two italics; [^*] keeps a token from
  // swallowing the marker of the next one.
  const parts = str.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <span
          key={j}
          style={{
            fontWeight: 600,
            color: "var(--text)",
            background: "var(--accent-soft)",
            borderRadius: 4,
            padding: "0 3px",
            margin: "0 -1px",
            boxDecorationBreak: "clone",
            WebkitBoxDecorationBreak: "clone",
          }}
        >
          {part.slice(2, -2)}
        </span>
      );
    }
    if (part.startsWith("*") && part.endsWith("*") && part.length > 2) {
      return (
        <em key={j} style={{ fontStyle: "italic" }}>
          {part.slice(1, -1)}
        </em>
      );
    }
    return <span key={j}>{part}</span>;
  });
}

function ChangesBlock({ content }: { content: string }) {
  const rows = content
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        background: "var(--accent-soft)",
        border: "1px solid rgba(212,165,116,0.18)",
        borderRadius: 12,
      }}
    >
      <div
        style={{
          fontFamily: "var(--mono)",
          fontSize: 9,
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--accent)",
          marginBottom: 8,
        }}
      >
        Changes
      </div>
      {rows.map((row, i) => {
        const [name, ...rest] = row.split("·");
        return (
          <div
            key={i}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "baseline",
              padding: "3px 0",
              fontFamily: "var(--mono)",
              fontSize: 11,
            }}
          >
            <span style={{ color: "var(--text)", minWidth: 0, overflowWrap: "break-word" }}>{name?.trim()}</span>
            {rest.length > 0 && (
              <span style={{ color: "var(--positive)", flexShrink: 0, marginLeft: 8 }}>{rest.join("·").trim()}</span>
            )}
          </div>
        );
      })}
    </div>
  );
}

export function FormatText({ text }: FormatTextProps) {
  // Split out <changes>...</changes> blocks
  const segments = text.split(/(<changes>[\s\S]*?<\/changes>)/g);

  return (
    <>
      {segments.map((seg, idx) => {
        if (seg.startsWith("<changes>") && seg.endsWith("</changes>")) {
          const inner = seg.slice("<changes>".length, -"</changes>".length).trim();
          return <ChangesBlock key={idx} content={inner} />;
        }

        const lines = seg.split("\n");
        return (
          <span key={idx}>
            {lines.map((line, i) => {
              const isBullet =
                line.trim().startsWith("- ") || line.trim().startsWith("• ");
              const bulletContent = isBullet
                ? line.trim().replace(/^[-•]\s*/, "")
                : null;

              if (isBullet && bulletContent) {
                return (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      gap: 6,
                      paddingLeft: 2,
                      marginTop: i > 0 ? 3 : 0,
                    }}
                  >
                    <span style={{ color: "var(--text-faint)", flexShrink: 0 }}>·</span>
                    <span>{formatInline(bulletContent)}</span>
                  </div>
                );
              }

              if (line.trim() === "---") {
                return <hr key={i} style={{ border: "none", borderTop: "1px solid var(--border)", margin: "8px 0" }} />;
              }

              if (line.trim() === "") {
                return <div key={i} style={{ height: 8 }} />;
              }

              return (
                <div
                  key={i}
                  style={{ marginTop: i > 0 && lines[i - 1]?.trim() !== "" ? 2 : 0 }}
                >
                  {formatInline(line)}
                </div>
              );
            })}
          </span>
        );
      })}
    </>
  );
}
