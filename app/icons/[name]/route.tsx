import { ImageResponse } from "next/og";

const SIZES: Record<string, { size: number; maskable: boolean }> = {
  "192.png": { size: 192, maskable: false },
  "512.png": { size: 512, maskable: false },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-touch.png": { size: 180, maskable: true },
};

export function generateStaticParams() {
  return Object.keys(SIZES).map((name) => ({ name }));
}

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cfg = SIZES[name];
  if (!cfg) return new Response("Not found", { status: 404 });
  const { size, maskable } = cfg;
  // El contenido de un ícono "maskable" debe vivir dentro del 80% central.
  const glyph = size * (maskable ? 0.4 : 0.5);
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(145deg, #1a1033 0%, #07070d 55%, #0b2a2a 100%)",
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        <div
          style={{
            width: glyph * 1.5,
            height: glyph * 1.5,
            borderRadius: glyph * 0.45,
            background: "linear-gradient(135deg, #c4f542, #5eead4)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#10130a",
            fontSize: glyph,
            fontWeight: 800,
          }}
        >
          $
        </div>
      </div>
    ),
    { width: size, height: size },
  );
}
