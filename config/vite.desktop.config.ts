import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { resolve } from "node:path";

const projectRoot = resolve(__dirname, "..");

export default defineConfig({
  root: resolve(projectRoot, "desktop"),
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(projectRoot, "desktop", "renderer"),
    emptyOutDir: true,
    sourcemap: false,
  },
});
