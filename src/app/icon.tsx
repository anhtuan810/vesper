import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <svg viewBox="0 0 60 60" width="20" height="20" fill="none">
          <polygon points="4,8 16,8 30,46 44,8 56,8 33,54 27,54" fill="#F5F1EA" />
          <polygon points="18,10 42,10 30,42" fill="#4A7C5E" />
        </svg>
      </div>
    ),
    size
  );
}
