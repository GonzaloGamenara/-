import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";

// Mismo logo que se ve dentro de la app: degradé lima→turquesa con "$" oscuro.
// Siempre a sangre completa (sin esquinas transparentes): iOS/Android redondean solos.
const SIZES: Record<string, { size: number; glyph: number }> = {
  "192.png": { size: 192, glyph: 0.56 },
  "512.png": { size: 512, glyph: 0.56 },
  "maskable-512.png": { size: 512, glyph: 0.44 }, // zona segura del 80%
  "apple-touch.png": { size: 180, glyph: 0.56 },
};

export const dynamic = "force-static";

export function generateStaticParams() {
  return Object.keys(SIZES).map((name) => ({ name }));
}

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const cfg = SIZES[name];
  if (!cfg) return new Response("Not found", { status: 404 });
  const { size, glyph } = cfg;
  // Misma tipografía que el logo dentro de la app
  const font = await readFile(join(process.cwd(), "node_modules/geist/dist/fonts/geist-sans/Geist-Black.ttf"));
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "linear-gradient(135deg, #c4f542 0%, #5eead4 100%)",
          color: "#10130a",
          fontSize: size * glyph,
          fontFamily: "Geist",
          fontWeight: 900,
          letterSpacing: "-0.02em",
        }}
      >
        $
      </div>
    ),
    {
      width: size,
      height: size,
      fonts: [{ name: "Geist", data: font, weight: 900, style: "normal" }],
      headers: { "Cache-Control": "public, max-age=86400" },
    },
  );
}
