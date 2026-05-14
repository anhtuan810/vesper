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
          background: "#1A1814",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 36,
        }}
      >
        <svg viewBox="0 0 72 60" width="124" height="103" fill="none">
          <path fill="#F5F1EA" d="M 4 4 L 16 4 L 36 50 L 56 4 L 68 4 L 42 56 L 30 56 Z" />
          <path fill="#4A7C5E" d="M 20 4 L 30 4 L 36 28 L 42 4 L 52 4 L 41 36 L 31 36 Z" />
        </svg>
      </div>
    ),
    size
  );
}
