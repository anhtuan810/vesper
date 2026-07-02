import { ImageResponse } from "next/og";

export const alt = "Volnar — Wealth. Watched over.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Inter for the headline — the brand's one instrument family (Nocturne),
// fetched as TTF via the css2 endpoint (no User-Agent → TTF URLs, which satori
// can render; woff2 cannot). Falls back to the built-in sans if the fetch
// fails so the image always renders.
async function loadFont(query: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Inter:${query}&display=swap`
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const [inter, interRegular, interItalic] = await Promise.all([
    loadFont("opsz,wght@14..32,600"),
    loadFont("opsz,wght@14..32,400"),
    loadFont("ital,opsz,wght@1,14..32,400"),
  ]);
  const headlineFont = inter ? "Inter" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#F6F5F1",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* Left: headline + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
              <polygon points="4,8 16,8 30,46 44,8 56,8 33,54 27,54" fill="#26221A" />
              <polygon points="18,10 42,10 30,42" fill="#9C7A37" />
            </svg>
            <div
              style={{
                fontFamily: headlineFont,
                fontSize: 38,
                fontWeight: 600,
                color: "#17130A",
                letterSpacing: "-0.01em",
              }}
            >
              Volnar
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              marginTop: "auto",
              marginBottom: "auto",
            }}
          >
            <div
              style={{
                fontFamily: headlineFont,
                fontSize: 104,
                fontWeight: 600,
                color: "#17130A",
                letterSpacing: "-0.03em",
                lineHeight: 1,
              }}
            >
              Wealth.
            </div>
            <div
              style={{
                fontFamily: headlineFont,
                fontSize: 104,
                fontStyle: "italic",
                fontWeight: 400,
                color: "#7E6026",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Watched over.
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 26, fontStyle: "italic", color: "#8C8574" }}>
            Everything you own, in one calm place · volnar.nl
          </div>
        </div>

        {/* Right: net-worth card mock */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 360,
            background: "#FFFFFF",
            border: "1px solid rgba(32,27,16,0.10)",
            borderRadius: 24,
            padding: "36px 36px 32px",
            boxShadow: "0 40px 80px -32px rgba(34,30,38,0.22)",
            alignSelf: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 17,
              letterSpacing: "0.08em",
              color: "#8C8574",
              textTransform: "uppercase",
            }}
          >
            Net worth
          </div>
          <div
            style={{
              display: "flex",
              fontFamily: headlineFont,
              fontSize: 58,
              fontWeight: 600,
              color: "#17130A",
              letterSpacing: "-0.02em",
              marginTop: 8,
            }}
          >
            €616.086
          </div>
          <div
            style={{
              display: "flex",
              alignSelf: "flex-start",
              fontSize: 19,
              color: "#277A52",
              background: "rgba(46,139,94,0.13)",
              borderRadius: 8,
              padding: "6px 14px",
              marginTop: 14,
            }}
          >
            + 2,1% past month
          </div>
          {/* Allocation bar */}
          <div style={{ display: "flex", gap: 4, marginTop: 32, height: 12 }}>
            <div style={{ display: "flex", flex: 50, background: "#3E8E6B", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 26, background: "#4E7398", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 12, background: "#948A66", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 6, background: "#C2832F", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 6, background: "#8C7B5E", borderRadius: 6 }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 26,
              paddingTop: 22,
              borderTop: "1px solid rgba(32,27,16,0.10)",
              fontSize: 19,
              color: "#26221A",
            }}
          >
            <span>Home · Amsterdam</span>
            <span>€308.000</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 14,
              fontSize: 19,
              color: "#26221A",
            }}
          >
            <span>NVIDIA · 180 sh</span>
            <span>€186.624</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: inter
        ? [
            { name: "Inter", data: inter, weight: 600 as const, style: "normal" as const },
            {
              name: "Inter",
              data: interRegular ?? inter,
              weight: 400 as const,
              style: "normal" as const,
            },
            {
              name: "Inter",
              data: interItalic ?? interRegular ?? inter,
              weight: 400 as const,
              style: "italic" as const,
            },
          ]
        : undefined,
    }
  );
}
