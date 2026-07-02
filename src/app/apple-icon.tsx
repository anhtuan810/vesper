import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#1A150C",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
        }}
      >
        <svg viewBox="0 0 60 60" width="120" height="120" fill="none">
          <polygon points="4,8 16,8 30,46 44,8 56,8 33,54 27,54" fill="#F1E9D6" />
          <polygon points="18,10 42,10 30,42" fill="#CBA75E" />
        </svg>
      </div>
    ),
    size
  );
}
