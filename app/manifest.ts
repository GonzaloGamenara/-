import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Gastos",
    short_name: "Gastos",
    description: "Anotá tus gastos e ingresos en segundos.",
    id: "/",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#c4f542",
    theme_color: "#07070d",
    lang: "es-AR",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icons/192.png?v=2", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/512.png?v=2", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png?v=2", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nuevo gasto", short_name: "Gasto", url: "/?add=expense" },
      { name: "Nuevo ingreso", short_name: "Ingreso", url: "/?add=income" },
    ],
  };
}
