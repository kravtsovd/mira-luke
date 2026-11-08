import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Мира и Люк - мультики и игры",
    short_name: "Мира и Люк",
    description: "Любимые мультики, свой каталог и развивающие игры.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f7f6fc",
    theme_color: "#ffffff",
    lang: "ru",
    icons: [{ src: "/icon", sizes: "512x512", type: "image/png", purpose: "any" }],
  };
}
