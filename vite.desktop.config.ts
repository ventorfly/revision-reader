import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

export default defineConfig({
  root: resolve(__dirname, "desktop"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "desktop", "renderer"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
