import type { Metadata, Viewport } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Providers } from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gastos",
  description: "Anotá tus gastos e ingresos en segundos y mirá a dónde se va tu plata.",
  applicationName: "Gastos",
  appleWebApp: { capable: true, title: "Gastos", statusBarStyle: "black-translucent" },
  icons: { apple: "/icons/apple-touch.png", icon: "/icons/192.png" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#07070d" },
    { media: "(prefers-color-scheme: light)", color: "#f3f2f8" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={`${GeistSans.variable} ${GeistMono.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
