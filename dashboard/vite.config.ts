import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// The dashboard reads static_info.json and flight_data/*.json directly from
// ../gate-sorting-algorithm, so allow the dev server to serve that folder.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { fs: { allow: [".."] } },
});
