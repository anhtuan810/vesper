interface FormatTextProps {
  text: string;
}

function formatInline(str: string) {
  const parts = str.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, j) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <span key={j} style={{ fontWeight: 600, color: "#0F0E0C" }}>
          {part.slice(2, -2)}
        </span>
      );
    }
    return <span key={j}>{part}</span>;
  });
}

export function FormatText({ text }: FormatTextProps) {
  const lines = text.split("\n");

  return (
    <>
      {lines.map((line, i) => {
        const isBullet = line.trim().startsWith("- ") || line.trim().startsWith("• ");
        const bulletContent = isBullet ? line.trim().replace(/^[-•]\s*/, "") : null;

        if (isBullet && bulletContent) {
          return (
            <div key={i} style={{ display: "flex", gap: 6, paddingLeft: 2, marginTop: i > 0 ? 3 : 0 }}>
              <span style={{ color: "#9CA3AF", flexShrink: 0 }}>·</span>
              <span>{formatInline(bulletContent)}</span>
            </div>
          );
        }

        if (line.trim() === "") {
          return <div key={i} style={{ height: 8 }} />;
        }

        return (
          <div key={i} style={{ marginTop: i > 0 && lines[i - 1]?.trim() !== "" ? 2 : 0 }}>
            {formatInline(line)}
          </div>
        );
      })}
    </>
  );
}
