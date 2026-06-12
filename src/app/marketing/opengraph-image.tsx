import { ImageResponse } from "next/og";

export const alt = "Volnar — Wealth. Watched over.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Source Serif 4 for the headline, fetched as TTF via the css2 endpoint (no
// User-Agent → TTF URLs, which satori can render; woff2 cannot). Falls back to
// the built-in sans if the fetch fails so the image always renders.
async function loadSerif(query: string): Promise<ArrayBuffer | null> {
  try {
    const css = await fetch(
      `https://fonts.googleapis.com/css2?family=Source+Serif+4:${query}&display=swap`
    ).then((r) => r.text());
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    if (!url) return null;
    return await fetch(url).then((r) => r.arrayBuffer());
  } catch {
    return null;
  }
}

export default async function Image() {
  const [serif, serifRegular, serifItalic] = await Promise.all([
    loadSerif("opsz,wght@8..60,600"),
    loadSerif("opsz,wght@8..60,400"),
    loadSerif("ital,opsz,wght@1,8..60,400"),
  ]);
  const headlineFont = serif ? "Source Serif 4" : "sans-serif";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          background: "#EEF0EC",
          padding: "72px 80px",
          position: "relative",
        }}
      >
        {/* Left: headline + wordmark */}
        <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="44" height="44" viewBox="0 0 60 60" fill="none">
              <polygon points="4,8 16,8 30,46 44,8 56,8 33,54 27,54" fill="#232826" />
              <polygon points="18,10 42,10 30,42" fill="#4A7C5E" />
            </svg>
            <div
              style={{
                fontFamily: headlineFont,
                fontSize: 38,
                fontWeight: 600,
                color: "#131816",
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
                color: "#131816",
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
                color: "#2E6E60",
                letterSpacing: "-0.03em",
                lineHeight: 1.1,
              }}
            >
              Watched over.
            </div>
          </div>

          <div style={{ display: "flex", fontSize: 26, fontStyle: "italic", color: "#6A736E" }}>
            Everything you own, in one calm place · volnar.nl
          </div>
        </div>

        {/* Right: net-worth card mock */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: 360,
            background: "#FBFCFB",
            border: "1px solid rgba(30,40,38,0.10)",
            borderRadius: 24,
            padding: "36px 36px 32px",
            boxShadow: "0 40px 80px -32px rgba(26,31,46,0.25)",
            alignSelf: "center",
          }}
        >
          <div
            style={{
              display: "flex",
              fontSize: 17,
              letterSpacing: "0.08em",
              color: "#97A09A",
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
              color: "#131816",
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
              color: "#235048",
              background: "#D7E6E0",
              borderRadius: 8,
              padding: "6px 14px",
              marginTop: 14,
            }}
          >
            + 2,1% past month
          </div>
          {/* Allocation bar */}
          <div style={{ display: "flex", gap: 4, marginTop: 32, height: 12 }}>
            <div style={{ display: "flex", flex: 50, background: "#4C7268", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 26, background: "#6B8AA6", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 12, background: "#9C8A63", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 6, background: "#B5564B", borderRadius: 6 }} />
            <div style={{ display: "flex", flex: 6, background: "#8C7B5E", borderRadius: 6 }} />
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 26,
              paddingTop: 22,
              borderTop: "1px solid rgba(30,40,38,0.10)",
              fontSize: 19,
              color: "#232826",
            }}
          >
            <span>House · Lelystad</span>
            <span>€308.000</span>
          </div>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginTop: 14,
              fontSize: 19,
              color: "#232826",
            }}
          >
            <span>ASML · 312 sh</span>
            <span>€186.624</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: serif
        ? [
            { name: "Source Serif 4", data: serif, weight: 600 as const, style: "normal" as const },
            {
              name: "Source Serif 4",
              data: serifRegular ?? serif,
              weight: 400 as const,
              style: "normal" as const,
            },
            {
              name: "Source Serif 4",
              data: serifItalic ?? serifRegular ?? serif,
              weight: 400 as const,
              style: "italic" as const,
            },
          ]
        : undefined,
    }
  );
}
