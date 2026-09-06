import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Scholar's Quill",
    short_name: "Scholar's Quill",
    description: "Your private writing workspace",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0c0e15",
    theme_color: "#0c0e15",
    icons: [
      { src: "/icons/quill-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/quill-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/quill-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
