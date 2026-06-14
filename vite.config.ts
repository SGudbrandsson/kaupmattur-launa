import { defineConfig } from "vite";
import preact from "@preact/preset-vite";

export default defineConfig({
  base: "./",
  plugins: [preact()],
  server: {
    host: true, // listen on all interfaces (0.0.0.0) so the dev server is reachable from other hosts
    allowedHosts: true, // accept any Host header (e.g. antfarm1), not just localhost/IP
  },
  preview: {
    host: true,
    allowedHosts: true,
  },
});
