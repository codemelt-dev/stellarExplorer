import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

export const alt = "Astrolabe, a human-first explorer for the Stellar network";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function Image() {
  const icon = await readFile(join(process.cwd(), "app/icon.png"));
  const iconSrc = `data:image/png;base64,${icon.toString("base64")}`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          background: "linear-gradient(135deg, #101214 0%, #191c1f 100%)",
          padding: "0 96px",
          gap: 72,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={iconSrc} alt="" width={280} height={280} style={{ borderRadius: 48 }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ fontSize: 84, fontWeight: 700, color: "#e8eaed" }}>Astrolabe</div>
          <div style={{ fontSize: 36, color: "#ffd166" }}>
            A human-first explorer for the Stellar network
          </div>
          <div style={{ fontSize: 28, color: "#9aa0a6" }}>
            Decoded by default, raw on demand
          </div>
        </div>
      </div>
    ),
    { ...size }
  );
}
