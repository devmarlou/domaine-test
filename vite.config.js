import { defineConfig } from "vite";
import shopify from "vite-plugin-shopify";
import tailwindcss from "@tailwindcss/vite";
import shopifyClean from "@driver-digital/vite-plugin-shopify-clean";

export default defineConfig({
  plugins: [
    shopify({
      tunnel: true,
      themeRoot: ".",
      sourceCodeDir: "frontend",
    }),
    shopifyClean({}),
    tailwindcss(),
  ],
  build: {
    emptyOutDir: false,
    sourcemap: true,
  },
});
