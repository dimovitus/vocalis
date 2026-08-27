import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Use 127.0.0.1 explicitly — WebKitGTK on Linux often fails with "localhost".
const DEV_HOST = "127.0.0.1";
const DEV_PORT = 1420;

export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_"],
  server: {
    port: DEV_PORT,
    strictPort: true,
    host: DEV_HOST,
    hmr: {
      protocol: "ws",
      host: DEV_HOST,
      port: DEV_PORT + 1,
    },
    watch: {
      ignored: ["**/src-tauri/**"],
    },
  },
});
